import {
  isProtocol, isQuoteAddr, PONS_FACTORY_V2,
  POOL_GRADUATED_TOPIC0, LAUNCH_SWEPT_TOPIC0,
} from "@/lib/line/constants";
import type { HealthSource } from "@/lib/line/types";
import type { FactoryLaunch } from "./factory";
import { fail, miss } from "./http";

const TIMEOUT_MS = 4000;
const CACHE_MS = 5 * 60 * 1000;

type RpcLog = {
  address?: string;
  topics?: string[];
  data?: string;
  blockNumber?: string;
  transactionHash?: string;
};

type GradPack = { launches: FactoryLaunch[]; at: number };

let lastGood: GradPack | null = null;

function topicToAddress(topic: string | undefined): string | null {
  if (!topic || topic.length < 66) return null;
  const addr = "0x" + topic.slice(-40);
  return /^0x[a-fA-F0-9]{40}$/.test(addr) ? addr : null;
}

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (!res.ok || json.error) throw new Error("pons-v2-grad: " + (json.error?.message || "HTTP " + res.status));
  return json.result as T;
}

function parseGradLog(log: RpcLog): FactoryLaunch | null {
  const topics = log.topics || [];
  const topic0 = topics[0]?.toLowerCase();
  if (topic0 !== POOL_GRADUATED_TOPIC0 && topic0 !== LAUNCH_SWEPT_TOPIC0) return null;
  const token = topicToAddress(topics[1]);
  if (!token || isProtocol(token)) return null;
  return {
    token,
    deployer: "0x0000000000000000000000000000000000000000",
    factory: PONS_FACTORY_V2,
    blockNumber: log.blockNumber ? Number.parseInt(log.blockNumber, 16) : 0,
    txHash: log.transactionHash || "",
    timestampMs: null,
    chain: "robinhood",
    pad: "PONS",
    graduated: true,
  };
}

function cachedIfFresh(): GradPack | null {
  if (!lastGood || !lastGood.launches.length) return null;
  if (Date.now() - lastGood.at >= CACHE_MS) return null;
  return lastGood;
}

export async function harvestPonsV2Graduations(): Promise<{ launches: FactoryLaunch[]; health: HealthSource }> {
  const name = "pons-v2-grad";
  const rpcUrl = process.env.ROBINHOOD_RPC_URL;
  if (!rpcUrl) {
    return { launches: [], health: miss(name, "not wired") };
  }

  const cached = cachedIfFresh();
  if (cached) {
    return {
      launches: cached.launches,
      health: {
        name,
        ok: true,
        hits: 1,
        attempts: 1,
        ms: 0,
        detail: cached.launches.length + " graduated (cached)",
      },
    };
  }

  const t0 = Date.now();
  try {
    const headHex = await rpc<string>(rpcUrl, "eth_blockNumber", []);
    const head = Number.parseInt(headHex, 16);
    const from = Math.max(0, head - 80_000);
    const [poolGradLogs, sweptLogs] = await Promise.all([
      rpc<RpcLog[]>(rpcUrl, "eth_getLogs", [{
        address: PONS_FACTORY_V2,
        fromBlock: "0x" + from.toString(16),
        toBlock: "0x" + head.toString(16),
        topics: [POOL_GRADUATED_TOPIC0],
      }]),
      rpc<RpcLog[]>(rpcUrl, "eth_getLogs", [{
        address: PONS_FACTORY_V2,
        fromBlock: "0x" + from.toString(16),
        toBlock: "0x" + head.toString(16),
        topics: [LAUNCH_SWEPT_TOPIC0],
      }]),
    ]);

    const seen = new Set<string>();
    const launches: FactoryLaunch[] = [];
    for (const log of [...poolGradLogs, ...sweptLogs]) {
      const parsed = parseGradLog(log);
      if (!parsed) continue;
      const key = parsed.token.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (parsed.blockNumber && head) {
        parsed.timestampMs = Date.now() - ((head - parsed.blockNumber) / 10) * 1000;
      }
      launches.push(parsed);
    }

    lastGood = { launches, at: Date.now() };
    return {
      launches,
      health: {
        name,
        ok: true,
        hits: 1,
        attempts: 1,
        ms: Date.now() - t0,
        detail: launches.length + " graduated",
      },
    };
  } catch (err) {
    if (lastGood && lastGood.launches.length) {
      return {
        launches: lastGood.launches,
        health: {
          name,
          ok: true,
          hits: 1,
          attempts: 1,
          ms: Date.now() - t0,
          detail: lastGood.launches.length + " graduated (last good)",
        },
      };
    }
    return { launches: [], health: fail(name, err, t0) };
  }
}
