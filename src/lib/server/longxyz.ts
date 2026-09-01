import type { HealthSource } from "@/lib/line/types";
import type { FactoryLaunch } from "./factory";
import { fetchDexSearch, type DexPair } from "./dexscreener";

const CACHE_MS = 5 * 60 * 1000;

type CachePack = { launches: FactoryLaunch[]; health: HealthSource; at: number };
let lastGood: CachePack | null = null;

// Stock tickers used as quote tokens on app.long.xyz
const STOCK_QUOTES = ["NVDA", "AAPL", "TSLA", "MSTR", "MU", "SPCX", "TSM", "MSFT", "GOOGL", "PLTR", "HIMS", "INTC", "GLD", "AI", "DJT"];

function mapChainId(chainId?: string): "robinhood" | null {
  if (chainId === "robinhood" || chainId === "4663") return "robinhood";
  return null;
}

function isStockQuoted(pair?: DexPair | null): boolean {
  if (!pair) return false;
  const quoteSymbol = (pair.quoteToken?.symbol || "").toUpperCase();
  return STOCK_QUOTES.includes(quoteSymbol);
}

function isQuoteAssetItself(pair?: DexPair | null): boolean {
  if (!pair) return false;
  const baseSymbol = (pair.baseToken?.symbol || "").toUpperCase();
  return STOCK_QUOTES.includes(baseSymbol);
}

function pairToLaunch(pair: DexPair): FactoryLaunch | null {
  const chain = mapChainId(pair.chainId);
  if (chain !== "robinhood") return null;
  const token = pair.baseToken?.address;
  if (!token) return null;
  
  if (!isStockQuoted(pair)) return null;
  if (isQuoteAssetItself(pair)) return null;

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
    const KNOWN_LONG_NAMES = ["SAYLORMOON", "MOO", "SPACEHOOD", "AAPLCAT"];
    const launches: FactoryLaunch[] = [];
    const seen = new Set<string>();

    const searchQueries = [...STOCK_QUOTES, ...KNOWN_LONG_NAMES];
    const searchJobs = searchQueries.map(async (q) => {
      try {
        const { items } = await fetchDexSearch(q);
        for (const pair of items) {
          const chain = mapChainId(pair.chainId);
          if (chain !== "robinhood") continue;

          const launch = pairToLaunch(pair);
          if (!launch) continue;
          const key = launch.token.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          launches.push(launch);
        }
      } catch {
        // Skip failed searches
      }
    });

    await Promise.all(searchJobs);
    
    const ms = Date.now() - t0;
    const health: HealthSource = {
      name: source,
      ok: true,
      hits: launches.length > 0 ? 1 : 0,
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
