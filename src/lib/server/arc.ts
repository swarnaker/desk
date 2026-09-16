import type { HealthSource } from "@/lib/line/types";
import type { FactoryLaunch } from "./factory";
import { fetchDexSearch } from "./dexscreener";
import { isEvmCa } from "@/lib/line/ca";
import { isProtocol, isQuoteAddr } from "@/lib/line/constants";
import { mapDexChain } from "./classify";
import { fail, miss } from "./http";

const CACHE_MS = 5 * 60 * 1000;

type CachePack = { launches: FactoryLaunch[]; health: HealthSource; at: number };
let lastGood: CachePack | null = null;

const ARC_CHAIN_ID = "5042";
const TOKEN_LAUNCHED_TOPIC0 = "0xdb51ea9ad51ab453a65a4cb7e60c3cb378c9501bb002609f8f97778fb6c4235a";

type RpcLog = {
  address?: string;
  topics?: string[];
  data?: string;
  blockNumber?: string;
  transactionHash?: string;
};

function getArcFactories(): string[] {
  const env = process.env.ARC_FACTORY || "";
  if (!env.trim()) return [];
  return env
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && isEvmCa(s));
}

function getArcRpcUrl(): string {
  return process.env.ARC_RPC_URL || "https://rpc.mainnet.arc.io";
}

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

function parseArcLog(log: RpcLog, factory: string): FactoryLaunch | null {
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

async function harvestArcDexScreener(): Promise<{ launches: FactoryLaunch[]; ok: boolean }> {
  try {
    // Try searching for "arc" to see if DexScreener has indexed Arc mainnet
    const { items, health } = await fetchDexSearch("arc");
    if (!health.ok || !items.length) return { launches: [], ok: false };

    const launches: FactoryLaunch[] = [];
    const seen = new Set<string>();

    for (const pair of items) {
      // Only keep pairs on Arc chain (chainId 5042)
      const chain = mapDexChain(pair.chainId);
      if (chain !== "arc") continue;

      const token = pair.baseToken?.address;
      if (!token || !isEvmCa(token)) continue;
      if (isProtocol(token)) continue;
      if (isQuoteAddr(token, pair.baseToken?.symbol)) continue;

      const key = token.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      // Only keep USDC-quoted pairs
      const quoteSymbol = (pair.quoteToken?.symbol || "").toUpperCase();
      if (quoteSymbol !== "USDC") continue;

      launches.push({
        token,
        deployer: "0x0000000000000000000000000000000000000000",
        factory: "",
        blockNumber: 0,
        txHash: "",
        timestampMs: pair.pairCreatedAt ? pair.pairCreatedAt : null,
        name: pair.baseToken?.name,
        symbol: pair.baseToken?.symbol,
        chain: "arc",
        pad: "ARC",
        mcapUsd: pair.marketCap ?? pair.fdv,
        liqUsd: pair.liquidity?.usd,
        vol1hUsd: pair.volume?.h1,
        logo: pair.info?.imageUrl,
        graduated: true,
      });
    }

    return { launches, ok: launches.length > 0 };
  } catch {
    return { launches: [], ok: false };
  }
}

async function harvestArcFactory(): Promise<{ launches: FactoryLaunch[]; ok: boolean; detail: string }> {
  const factories = getArcFactories();
  if (!factories.length) return { launches: [], ok: false, detail: "no factories" };

  const rpcUrl = getArcRpcUrl();
  const allLaunches: FactoryLaunch[] = [];
  const seen = new Set<string>();

  try {
    const headHex = await rpc<string>(rpcUrl, "eth_blockNumber", [], "arc factory");
    const head = Number.parseInt(headHex, 16);
    const from = Math.max(0, head - 80_000);

    for (const factory of factories) {
      try {
        const logs = await rpc<RpcLog[]>(rpcUrl, "eth_getLogs", [{
          address: factory,
          fromBlock: "0x" + from.toString(16),
          toBlock: "0x" + head.toString(16),
          topics: [TOKEN_LAUNCHED_TOPIC0],
        }], "arc factory " + factory);

        const launches = (logs || []).map((l) => parseArcLog(l, factory)).filter((x): x is FactoryLaunch => !!x);
        const now = Date.now();
        for (const l of launches) {
          const key = l.token.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          if (l.blockNumber && head) l.timestampMs = now - ((head - l.blockNumber) / 10) * 1000;
          allLaunches.push(l);
        }
      } catch {
        // Skip this factory on error
      }
    }

    return { 
      launches: allLaunches, 
      ok: true, 
      detail: allLaunches.length > 0 ? `${allLaunches.length} arc tokens (factory)` : "arc factory wired, 0 tokens"
    };
  } catch {
    return { launches: [], ok: false, detail: "factory rpc error" };
  }
}

export async function harvestArc(): Promise<{ launches: FactoryLaunch[]; health: HealthSource }> {
  const cached = lastGood;
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return { 
      launches: cached.launches, 
      health: { ...cached.health, ms: 0, detail: (cached.health.detail || "") + " (cached)" } 
    };
  }

  const t0 = Date.now();
  const source = "arc";

  try {
    // Try DexScreener first
    const dexResult = await harvestArcDexScreener();
    
    // If DexScreener has tokens, use those
    if (dexResult.ok && dexResult.launches.length > 0) {
      const ms = Date.now() - t0;
      const health: HealthSource = {
        name: source,
        ok: true,
        hits: 1,
        attempts: 1,
        ms,
        detail: `${dexResult.launches.length} arc tokens (dex)`,
      };
      lastGood = { launches: dexResult.launches, health, at: Date.now() };
      return { launches: dexResult.launches, health };
    }

    // Fallback to factory
    const factoryResult = await harvestArcFactory();
    if (factoryResult.ok && factoryResult.launches.length > 0) {
      const ms = Date.now() - t0;
      const health: HealthSource = {
        name: source,
        ok: true,
        hits: 1,
        attempts: 1,
        ms,
        detail: factoryResult.detail,
      };
      lastGood = { launches: factoryResult.launches, health, at: Date.now() };
      return { launches: factoryResult.launches, health };
    }

    // Both empty but wired - return [] with "arc wired, 0 tokens"
    const ms = Date.now() - t0;
    const health: HealthSource = {
      name: source,
      ok: true,
      hits: 1,
      attempts: 1,
      ms,
      detail: factoryResult.ok ? factoryResult.detail : "arc wired, 0 tokens",
    };
    
    return { launches: [], health };
  } catch (err) {
    const ms = Date.now() - t0;
    return {
      launches: [],
      health: {
        name: source,
        ok: false,
        hits: 0,
        attempts: 1,
        ms,
        detail: err instanceof Error ? err.message : "not wired",
      },
    };
  }
}
