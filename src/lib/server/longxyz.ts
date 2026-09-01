import type { HealthSource } from "@/lib/line/types";
import type { FactoryLaunch } from "./factory";
import { fetchDexSearch, type DexPair } from "./dexscreener";

const CACHE_MS = 5 * 60 * 1000;

type CachePack = { launches: FactoryLaunch[]; health: HealthSource; at: number };
let lastGood: CachePack | null = null;

function mapChainId(chainId?: string): "robinhood" | null {
  if (chainId === "robinhood" || chainId === "4663") return "robinhood";
  return null;
}

function isLongLabeled(pair?: DexPair | null): boolean {
  if (!pair) return false;
  const labels = pair.labels || [];
  return labels.some((l) => {
    const lower = l.toLowerCase();
    return lower === "long" || lower === "long.xyz" || lower === "bankr";
  });
}

function hasLivePair(pair?: DexPair | null): boolean {
  if (!pair) return false;
  const quoteSymbol = pair.quoteToken?.symbol?.toLowerCase() || "";
  // Stock tokens or $AI quote
  const stocks = ["nvda", "aapl", "tsla", "djt", "spy", "qqq", "btc", "eth"];
  if (stocks.includes(quoteSymbol)) return true;
  if (quoteSymbol === "ai") return true;
  return false;
}

function pairToLaunch(pair: DexPair): FactoryLaunch | null {
  const chain = mapChainId(pair.chainId);
  if (chain !== "robinhood") return null;
  const token = pair.baseToken?.address;
  if (!token) return null;
  
  if (!isLongLabeled(pair)) return null;
  if (!hasLivePair(pair)) return null;

  return {
    token,
    deployer: "0x0000000000000000000000000000000000000000",
    factory: "",
    blockNumber: 0,
    txHash: "",
    timestampMs: pair.pairCreatedAt ? pair.pairCreatedAt : null,
    name: pair.baseToken?.name,
    symbol: pair.baseToken?.symbol,
    chain: "robinhood",
    pad: "LONG",
    mcapUsd: pair.marketCap ?? pair.fdv,
    liqUsd: pair.liquidity?.usd,
    vol1hUsd: pair.volume?.h1,
    logo: pair.info?.imageUrl,
    graduated: true,
  };
}

export async function harvestLongXyz(): Promise<{ launches: FactoryLaunch[]; health: HealthSource }> {
  const cached = lastGood;
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return { launches: cached.launches, health: { ...cached.health, ms: 0, detail: (cached.health.detail || "") + " (cached)" } };
  }

  const t0 = Date.now();
  const source = "longxyz";
  
  try {
    // Search DexScreener for long-labeled pairs on robinhood
    const { items } = await fetchDexSearch("long");
    
    const launches: FactoryLaunch[] = [];
    const seen = new Set<string>();
    
    for (const pair of items) {
      const chain = mapChainId(pair.chainId);
      if (chain !== "robinhood") continue;
      
      const launch = pairToLaunch(pair);
      if (!launch) continue;
      const key = `${launch.chain}:${launch.token.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      launches.push(launch);
    }
    
    const ms = Date.now() - t0;
    const health: HealthSource = {
      name: source,
      ok: true,
      hits: 1,
      attempts: 1,
      ms,
      detail: `${launches.length} long pairs`,
    };
    
    lastGood = { launches, health, at: Date.now() };
    return { launches, health };
  } catch (err) {
    const fallback = lastGood?.launches || [];
    return {
      launches: fallback,
      health: lastGood?.health || { name: source, ok: false, hits: 0, attempts: 1, ms: Date.now() - t0, detail: "not wired" },
    };
  }
}
