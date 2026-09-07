import { NextResponse } from "next/server";
import { harvestPonsGraduatedCatalog } from "@/lib/server/pons";
import { harvestPonsV2Graduations } from "@/lib/server/pons-v2-grad";
import { harvestPonsFactoryV2 } from "@/lib/server/factory";
import { fetchTokensV1Batched } from "@/lib/server/dexscreener";
import { isProtocol, isQuoteAddr } from "@/lib/line/constants";
import type { HealthSource } from "@/lib/line/types";
import type { FactoryLaunch } from "@/lib/server/factory";
import { heatScore } from "@/lib/line/heat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_AGE_SEC = 3600; // 1 hour
const CACHE_MS = 5 * 60 * 1000; // 5 minutes

type FirstHourToken = {
  token: string;
  deployer: string;
  factory: string;
  blockNumber: number;
  txHash: string;
  timestampMs: number;
  name?: string;
  symbol?: string;
  chain: string;
  pad: string;
  mcapUsd?: number;
  liqUsd?: number;
  vol1hUsd?: number;
  vol24hUsd?: number;
  buyPct?: number;
  curveFillPct?: number;
  logo?: string;
  quoteSymbol?: string;
  graduated?: boolean;
  ageSec: number;
  moving?: boolean;
  heat?: number;
};

type DataResponse = {
  tokens: FirstHourToken[];
  health: HealthSource[];
  timestamp: number;
};

let cache: { data: DataResponse; at: number } | null = null;

function num(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function isMoving(vol1hUsd?: number, buyPct?: number, liqUsd?: number, ageSec?: number): boolean {
  return (vol1hUsd ?? 0) >= 2000 && (liqUsd ?? 0) >= 3000 && (ageSec ?? 0) >= 60 && (buyPct ?? 0) >= 45;
}

export async function GET() {
  try {
    // Return cached data if fresh
    if (cache && Date.now() - cache.at < CACHE_MS) {
      return NextResponse.json(cache.data);
    }

    const rpcUrl = process.env.ROBINHOOD_RPC_URL;
    const health: HealthSource[] = [];
    const now = Date.now();

    // Fetch all sources in parallel
    const [catalogResult, rpcGradResult, rpcBondingResult] = await Promise.all([
      harvestPonsGraduatedCatalog(),
      rpcUrl ? harvestPonsV2Graduations() : Promise.resolve({ 
        launches: [], 
        health: { name: "RPC graduations", ok: false, hits: 0, attempts: 0, ms: 0, detail: "rpc not wired" } 
      }),
      rpcUrl ? harvestPonsFactoryV2() : Promise.resolve({ 
        launches: [], 
        health: { name: "RPC bonding", ok: false, hits: 0, attempts: 0, ms: 0, detail: "rpc not wired" } 
      }),
    ]);

    health.push(catalogResult.health);
    health.push(rpcGradResult.health);
    health.push(rpcBondingResult.health);

    // Merge all tokens
    const tokenMap = new Map<string, FirstHourToken>();

    const processLaunch = (launch: FactoryLaunch) => {
      const key = launch.token.toLowerCase();
      
      // Calculate age
      const timestampMs = launch.timestampMs || now;
      const ageSec = Math.floor((now - timestampMs) / 1000);
      
      // Filter by age
      if (ageSec >= MAX_AGE_SEC) return;
      
      const existing = tokenMap.get(key);
      
      if (!existing) {
        tokenMap.set(key, {
          token: launch.token,
          deployer: launch.deployer,
          factory: launch.factory,
          blockNumber: launch.blockNumber,
          txHash: launch.txHash,
          timestampMs,
          name: launch.name,
          symbol: launch.symbol,
          chain: launch.chain,
          pad: launch.pad,
          mcapUsd: launch.mcapUsd,
          liqUsd: launch.liqUsd,
          vol1hUsd: launch.vol1hUsd,
          logo: launch.logo,
          graduated: launch.graduated,
          ageSec,
        });
      } else {
        // Prefer tokens with metadata
        if (launch.name && !existing.name) {
          existing.name = launch.name;
        }
        if (launch.symbol && !existing.symbol) {
          existing.symbol = launch.symbol;
        }
        if (launch.logo && !existing.logo) {
          existing.logo = launch.logo;
        }
        // Prefer graduated status
        if (launch.graduated && !existing.graduated) {
          existing.graduated = true;
        }
        // Update market data
        if (launch.mcapUsd != null) {
          existing.mcapUsd = launch.mcapUsd;
        }
        if (launch.liqUsd != null) {
          existing.liqUsd = launch.liqUsd;
        }
      }
    };

    // Process all launches
    catalogResult.launches.forEach(processLaunch);
    rpcGradResult.launches.forEach(processLaunch);
    rpcBondingResult.launches.forEach(processLaunch);

    let tokens = Array.from(tokenMap.values());

    // Enrich with DexScreener data in batches
    if (tokens.length > 0) {
      const addresses = tokens.map(t => t.token);
      const dexResult = await fetchTokensV1Batched("robinhood", addresses);
      
      // Create a map for easy lookup
      const dexMap = new Map<string, typeof dexResult.items[0]>();
      for (const pair of dexResult.items) {
        const addr = pair.baseToken?.address?.toLowerCase();
        if (addr) dexMap.set(addr, pair);
      }
      
      for (const token of tokens) {
        const dexPair = dexMap.get(token.token.toLowerCase());
        
        if (dexPair) {
          // Resolve Unknown/??? tickers
          if (!token.symbol || token.symbol === "???" || token.symbol === "Unknown") {
            const baseSymbol = dexPair.baseToken?.symbol;
            if (baseSymbol && baseSymbol !== "???" && baseSymbol !== "Unknown") {
              token.symbol = baseSymbol;
            }
          }
          if (!token.name || token.name === "???" || token.name === "Unknown") {
            const baseName = dexPair.baseToken?.name;
            if (baseName && baseName !== "???" && baseName !== "Unknown") {
              token.name = baseName;
            }
          }

          // Enrich with volume, buyPct, price change, liquidity
          if (dexPair.volume?.h1 != null) {
            token.vol1hUsd = dexPair.volume.h1;
          }
          if (dexPair.volume?.h24 != null) {
            token.vol24hUsd = dexPair.volume.h24;
          }

          if (dexPair.txns?.h1) {
            const buys = dexPair.txns.h1.buys || 0;
            const sells = dexPair.txns.h1.sells || 0;
            const total = buys + sells;
            if (total > 0) {
              token.buyPct = (buys / total) * 100;
            }
          }

          if (dexPair.liquidity?.usd != null) {
            token.liqUsd = dexPair.liquidity.usd;
          }

          if (dexPair.fdv != null) {
            token.mcapUsd = dexPair.fdv;
          } else if (dexPair.marketCap != null) {
            token.mcapUsd = dexPair.marketCap;
          }

          // Calculate curveFillPct for bonding tokens
          if (!token.graduated && token.liqUsd != null && token.mcapUsd != null) {
            const curveCapacity = 85000;
            const curveFill = Math.min(token.liqUsd, curveCapacity);
            token.curveFillPct = Math.min((curveFill / curveCapacity) * 100, 100);
          }

          if (!token.logo && dexPair.info?.imageUrl) {
            token.logo = dexPair.info.imageUrl;
          }

          if (dexPair.quoteToken?.symbol) {
            token.quoteSymbol = dexPair.quoteToken.symbol;
          }
        }
      }
    }

    // Calculate heat and moving status
    for (const token of tokens) {
      const moving = isMoving(token.vol1hUsd, token.buyPct, token.liqUsd, token.ageSec);
      token.moving = moving;

      token.heat = heatScore({
        ageSec: token.ageSec,
        buyPct: token.buyPct,
        vol1hUsd: token.vol1hUsd,
        mcapUsd: token.mcapUsd,
        liqUsd: token.liqUsd,
        moving,
        pad: token.pad as any,
        curveFillPct: token.curveFillPct,
        inTaxWindow: false,
        riskLevel: "GREEN",
      });
    }

    // Handle duplicate tickers: keep highest heat, mark 2nd as COPY, hide rest
    const tickerGroups = new Map<string, FirstHourToken[]>();
    for (const token of tokens) {
      const ticker = (token.symbol || "").toUpperCase().trim();
      if (!ticker || ticker === "???" || ticker === "UNKNOWN") continue;
      
      if (!tickerGroups.has(ticker)) {
        tickerGroups.set(ticker, []);
      }
      tickerGroups.get(ticker)!.push(token);
    }

    const hiddenTokens = new Set<string>();
    
    for (const [ticker, group] of tickerGroups.entries()) {
      if (group.length <= 1) continue;

      group.sort((a, b) => (b.heat || 0) - (a.heat || 0));

      // Mark 2nd highest as COPY
      if (group[1]) {
        const currentSymbol = group[1].symbol || "";
        if (!currentSymbol.endsWith(" COPY")) {
          group[1].symbol = currentSymbol + " COPY";
        }
      }
      
      // Hide all tokens after the 2nd one
      for (let i = 2; i < group.length; i++) {
        hiddenTokens.add(group[i].token.toLowerCase());
      }
    }

    tokens = tokens.filter(token => !hiddenTokens.has(token.token.toLowerCase()));

    const response: DataResponse = {
      tokens,
      health,
      timestamp: now,
    };

    // Cache the response
    cache = { data: response, at: now };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching first hour tokens:", error);
    
    // Return cached data if available, even if stale
    if (cache) {
      return NextResponse.json(cache.data);
    }
    
    return NextResponse.json(
      { 
        tokens: [], 
        health: [{ 
          name: "first-hour", 
          ok: false, 
          hits: 0, 
          attempts: 1, 
          ms: 0, 
          detail: error instanceof Error ? error.message : "unknown error" 
        }],
        timestamp: Date.now() 
      },
      { status: 500 }
    );
  }
}
