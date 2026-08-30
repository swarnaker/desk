import type { HealthSource } from "@/lib/line/types";
import type { FactoryLaunch } from "./factory";
import { fetchDexSearch, type DexPair } from "./dexscreener";
import { fail } from "./http";

const CACHE_MS = 5 * 60 * 1000;

type CachePack = { launches: FactoryLaunch[]; health: HealthSource; at: number };
let lastGood: CachePack | null = null;

function mapChainId(chainId?: string): "base" | "robinhood" | null {
  if (chainId === "base" || chainId === "8453") return "base";
  if (chainId === "robinhood" || chainId === "4663") return "robinhood";
  return null;
}

function isClankerLabeled(pair?: DexPair | null): boolean {
  if (!pair) return false;
  const labels = pair.labels || [];
  return labels.some((l) => l.toLowerCase() === "clanker");
}

function pairToLaunch(pair: DexPair): FactoryLaunch | null {
  const chain = mapChainId(pair.chainId);
  if (!chain) return null;
  const token = pair.baseToken?.address;
  if (!token) return null;
  
  if (!isClankerLabeled(pair)) return null;

  return {
    token,
    deployer: "0x0000000000000000000000000000000000000000",
    factory: "",
    blockNumber: 0,
    txHash: "",
    timestampMs: pair.pairCreatedAt ? pair.pairCreatedAt : null,
    name: pair.baseToken?.name,
    symbol: pair.baseToken?.symbol,
    chain,
    pad: "CLANKER",
    mcapUsd: pair.marketCap ?? pair.fdv,
    liqUsd: pair.liquidity?.usd,
    vol1hUsd: pair.volume?.h1,
    logo: pair.info?.imageUrl,
    graduated: true,
  };
}

export async function harvestClanker(): Promise<{ launches: FactoryLaunch[]; health: HealthSource }> {
  const cached = lastGood;
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return { launches: cached.launches, health: { ...cached.health, ms: 0, detail: (cached.health.detail || "") + " (cached)" } };
  }

  const t0 = Date.now();
  const source = "clanker";
  
  try {
    // Search DexScreener for clanker-labeled pairs on Base and Robinhood
    const { items: baseItems } = await fetchDexSearch("clanker");
    
    const launches: FactoryLaunch[] = [];
    const seen = new Set<string>();
    
    for (const pair of baseItems) {
      const chain = mapChainId(pair.chainId);
      if (chain !== "base" && chain !== "robinhood") continue;
      
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
      detail: `${launches.length} clanker pairs`,
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
