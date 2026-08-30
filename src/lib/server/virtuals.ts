import type { HealthSource } from "@/lib/line/types";
import type { FactoryLaunch } from "./factory";
import { fetchDexSearch, type DexPair } from "./dexscreener";
import { fail } from "./http";

const VIRTUAL_CA_BASE = "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b";
const VIRTUAL_CA_RH = "0x44ff8620b8ca30902395a7bd3f2407e1a091bf73";
const CACHE_MS = 5 * 60 * 1000;

type CachePack = { launches: FactoryLaunch[]; health: HealthSource; at: number };
let lastGood: CachePack | null = null;

function isVirtualQuoted(pair?: DexPair | null, chain?: "base" | "robinhood" | "solana"): boolean {
  if (!pair || !chain) return false;
  const quoteAddr = pair.quoteToken?.address?.toLowerCase();
  const virtualCa = (chain === "base" ? VIRTUAL_CA_BASE : chain === "robinhood" ? VIRTUAL_CA_RH : "").toLowerCase();
  if (quoteAddr === virtualCa) return true;
  // Also accept WETH or USDC as graduated (42k VIRTUAL lock style)
  const wethBase = "0x4200000000000000000000000000000000000006";
  const usdcBase = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const wethRh = "0x4200000000000000000000000000000000000006";
  const usdcRh = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
  if (chain === "base" && (quoteAddr === wethBase.toLowerCase() || quoteAddr === usdcBase.toLowerCase())) return true;
  if (chain === "robinhood" && (quoteAddr === wethRh.toLowerCase() || quoteAddr === usdcRh.toLowerCase())) return true;
  return false;
}

function mapChainId(chainId?: string): "base" | "robinhood" | "solana" | null {
  if (chainId === "base" || chainId === "8453") return "base";
  if (chainId === "robinhood" || chainId === "4663") return "robinhood";
  if (chainId === "solana") return "solana";
  return null;
}

function pairToLaunch(pair: DexPair): FactoryLaunch | null {
  const chain = mapChainId(pair.chainId);
  if (!chain) return null;
  const token = pair.baseToken?.address;
  if (!token) return null;
  
  // Skip if still on curve (if that field exists)
  const labels = pair.labels || [];
  if (labels.some((l) => l.toLowerCase().includes("curve") || l.toLowerCase().includes("bonding"))) return null;
  
  // Must be VIRTUAL-quoted or have WETH/USDC pool (graduated)
  if (!isVirtualQuoted(pair, chain)) return null;

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
    pad: "VIRTUALS",
    mcapUsd: pair.marketCap ?? pair.fdv,
    liqUsd: pair.liquidity?.usd,
    vol1hUsd: pair.volume?.h1,
    logo: pair.info?.imageUrl,
    graduated: true,
  };
}

export async function harvestVirtuals(): Promise<{ launches: FactoryLaunch[]; health: HealthSource }> {
  const cached = lastGood;
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return { launches: cached.launches, health: { ...cached.health, ms: 0, detail: (cached.health.detail || "") + " (cached)" } };
  }

  const t0 = Date.now();
  const source = "virtuals";
  
  try {
    // Search DexScreener for VIRTUAL pairs
    const queries = [
      `${VIRTUAL_CA_BASE}`, // base
      `${VIRTUAL_CA_RH}`,   // robinhood
    ];
    
    const results = await Promise.all(queries.map((q) => fetchDexSearch(q)));
    const launches: FactoryLaunch[] = [];
    const seen = new Set<string>();
    
    for (const { items } of results) {
      for (const pair of items) {
        const launch = pairToLaunch(pair);
        if (!launch) continue;
        const key = `${launch.chain}:${launch.token.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        launches.push(launch);
      }
    }
    
    const ms = Date.now() - t0;
    const health: HealthSource = {
      name: source,
      ok: true,
      hits: 1,
      attempts: 1,
      ms,
      detail: `${launches.length} VIRTUAL pairs`,
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
