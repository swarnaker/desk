import { isProtocol } from "@/lib/line/constants";
import type { HealthSource } from "@/lib/line/types";
import type { FactoryLaunch } from "./factory";
import { fail } from "./http";

const ARC_MAINNET_CHAIN_ID = 5042;
const ARC_RPC_DEFAULT = "https://rpc.mainnet.arc.io";
const ARC_O1_FACTORY = "0xeE3E862Efde6DCd6DF5648AF0E2731B9D1dF4605";
const ARC_ARCPAD_FACTORY = "0x24196cd6e534cfce8f480b53e70809b68ea86f29";
const TOKEN_LAUNCHED_TOPIC0 = "0xdb51ea9ad51ab453a65a4cb7e60c3cb378c9501bb002609f8f97778fb6c4235a";

type ArcPadToken = {
  chainId?: number;
  address?: string;
  name?: string;
  symbol?: string;
  image?: string;
  marketCapUSD?: number;
  liquidityUSD?: number;
  volume24h?: number;
  deployer?: string;
  createdAt?: string;
};

type RpcLog = {
  address?: string;
  topics?: string[];
  data?: string;
  blockNumber?: string;
  transactionHash?: string;
};

function topicToAddress(topic: string | undefined): string | null {
  if (!topic || topic.length < 66) return null;
  const addr = "0x" + topic.slice(-40);
  return /^0x[a-fA-F0-9]{40}$/.test(addr) ? addr : null;
}

async function rpc<T>(url: string, method: string, params: unknown[], source: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(4000),
    cache: "no-store",
  });
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (!res.ok || json.error) throw new Error(source + ": " + (json.error?.message || "HTTP " + res.status));
  return json.result as T;
}

function parseArcFactoryLog(log: RpcLog, factory: string): FactoryLaunch | null {
  const topics = log.topics || [];
  if (!topics[0] || topics[0].toLowerCase() !== TOKEN_LAUNCHED_TOPIC0) return null;
  const token = topicToAddress(topics[1]);
  if (!token || isProtocol(token)) return null;
  const deployer = topicToAddress(topics[2]) || "0x0000000000000000000000000000000000000000";
  return {
    token,
    deployer,
    factory,
    blockNumber: log.blockNumber ? Number.parseInt(log.blockNumber, 16) : 0,
    txHash: log.transactionHash || "",
    timestampMs: null,
    chain: "arc",
    pad: "ARC",
  };
}

async function fetchArcPadApi(name: string): Promise<{ launches: FactoryLaunch[]; health: HealthSource }> {
  const t0 = Date.now();
  try {
    const res = await fetch("https://arcpad.meme/api/tokens", {
      method: "GET",
      headers: { accept: "application/json", "user-agent": "line-radar/1.0" },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const raw = (await res.json()) as unknown;
    const items = Array.isArray(raw) ? raw : [];
    const launches: FactoryLaunch[] = [];
    for (const item of items as ArcPadToken[]) {
      if (item.chainId !== ARC_MAINNET_CHAIN_ID) continue;
      const ca = item.address?.trim();
      if (!ca || !/^0x[a-fA-F0-9]{40}$/.test(ca)) continue;
      if (isProtocol(ca)) continue;
      const timestampMs = item.createdAt ? Date.parse(item.createdAt) : null;
      launches.push({
        token: ca,
        deployer: item.deployer || "0x0000000000000000000000000000000000000000",
        factory: "",
        blockNumber: 0,
        txHash: "",
        timestampMs: Number.isFinite(timestampMs) ? timestampMs : null,
        chain: "arc",
        pad: "ARC",
        name: item.name,
        symbol: item.symbol,
        mcapUsd: item.marketCapUSD,
        liqUsd: item.liquidityUSD,
        vol1hUsd: item.volume24h,
        logo: item.image,
      });
    }
    return {
      launches,
      health: { name, ok: true, hits: 1, attempts: 1, ms: Date.now() - t0, detail: launches.length + " tokens" },
    };
  } catch (err) {
    return { launches: [], health: fail(name, err, t0) };
  }
}

async function fetchArcFactories(name: string): Promise<{ launches: FactoryLaunch[]; health: HealthSource }> {
  const rpcUrl = process.env.ARC_RPC_URL || ARC_RPC_DEFAULT;
  const t0 = Date.now();
  try {
    const headHex = await rpc<string>(rpcUrl, "eth_blockNumber", [], name);
    const head = Number.parseInt(headHex, 16);
    const from = Math.max(0, head - 80_000);
    
    const factories = [ARC_O1_FACTORY, ARC_ARCPAD_FACTORY];
    const logJobs = factories.map(async (factory) => {
      const logs = await rpc<RpcLog[]>(rpcUrl, "eth_getLogs", [{
        address: factory,
        fromBlock: "0x" + from.toString(16),
        toBlock: "0x" + head.toString(16),
        topics: [TOKEN_LAUNCHED_TOPIC0],
      }], name);
      return (logs || []).map((l) => parseArcFactoryLog(l, factory)).filter((x): x is FactoryLaunch => !!x);
    });
    
    const results = await Promise.all(logJobs);
    const launches = results.flat();
    const now = Date.now();
    for (const l of launches) {
      if (l.blockNumber && head) l.timestampMs = now - ((head - l.blockNumber) / 10) * 1000;
    }
    
    return {
      launches,
      health: { name, ok: true, hits: 1, attempts: 1, ms: Date.now() - t0, detail: launches.length + " launches" },
    };
  } catch (err) {
    return { launches: [], health: fail(name, err, t0) };
  }
}

export async function harvestArc(): Promise<{ launches: FactoryLaunch[]; health: HealthSource }> {
  const [apiResult, factoryResult] = await Promise.all([
    fetchArcPadApi("Arc API"),
    fetchArcFactories("Arc factories"),
  ]);
  
  // Merge launches, preferring API data
  const map = new Map<string, FactoryLaunch>();
  for (const l of apiResult.launches) {
    map.set(l.token.toLowerCase(), l);
  }
  for (const l of factoryResult.launches) {
    const key = l.token.toLowerCase();
    if (!map.has(key)) {
      map.set(key, l);
    }
  }
  
  const launches = Array.from(map.values());
  const totalHits = apiResult.health.hits + factoryResult.health.hits;
  const totalAttempts = apiResult.health.attempts + factoryResult.health.attempts;
  const allOk = apiResult.health.ok && factoryResult.health.ok;
  
  if (launches.length === 0 && allOk) {
    return {
      launches: [],
      health: {
        name: "arc",
        ok: true,
        hits: totalHits,
        attempts: totalAttempts,
        ms: apiResult.health.ms + factoryResult.health.ms,
        detail: "arc wired, 0 tokens",
      },
    };
  }
  
  return {
    launches,
    health: {
      name: "arc",
      ok: allOk,
      hits: totalHits,
      attempts: totalAttempts,
      ms: apiResult.health.ms + factoryResult.health.ms,
      detail: launches.length + " tokens",
    },
  };
}
