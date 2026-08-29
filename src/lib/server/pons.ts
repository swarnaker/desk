import {
  isProtocol, isQuoteAddr, PONS_GRADUATED_CATALOG_URL,
} from "@/lib/line/constants";
import type { HealthSource } from "@/lib/line/types";
import type { FactoryLaunch } from "./factory";
import { fail } from "./http";

const CATALOG_TIMEOUT_MS = 4000;
const CATALOG_CACHE_MS = 5 * 60 * 1000;

type CatalogRow = {
  factory?: string;
  token?: string;
  deployer?: string;
  transactionHash?: string;
  blockNumber?: number;
  launchedAt?: string;
  graduatedAt?: string;
  name?: string;
  symbol?: string;
  logo?: string;
  marketCapUsd?: number | null;
  realMcapUsd?: number | null;
  liquidityUsd?: number | null;
  graduated?: boolean;
};

type CatalogPack = { launches: FactoryLaunch[]; at: number };

let lastGood: CatalogPack | null = null;

function num(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function mapCatalogItem(row: CatalogRow): FactoryLaunch | null {
  const token = (row.token || "").trim();
  if (!token || !/^0x[a-fA-F0-9]{40}$/.test(token)) return null;
  if (row.graduated !== true) return null;
  if (isProtocol(token) || isQuoteAddr(token, row.symbol)) return null;
  const launched = row.launchedAt ? Date.parse(row.launchedAt) : NaN;
  const graduatedAt = row.graduatedAt ? Date.parse(row.graduatedAt) : NaN;
  const ts = Number.isFinite(launched) ? launched : (Number.isFinite(graduatedAt) ? graduatedAt : null);
  const mcap = num(row.realMcapUsd) ?? num(row.marketCapUsd);
  return {
    token,
    deployer: row.deployer || "0x0000000000000000000000000000000000000000",
    factory: row.factory || "",
    blockNumber: typeof row.blockNumber === "number" ? row.blockNumber : 0,
    txHash: row.transactionHash || "",
    timestampMs: ts,
    name: row.name,
    symbol: row.symbol,
    chain: "robinhood",
    pad: "PONS",
    mcapUsd: mcap,
    liqUsd: num(row.liquidityUsd),
    logo: row.logo,
    graduated: true,
  };
}

function rowsFromRaw(raw: unknown): CatalogRow[] {
  if (Array.isArray(raw)) return raw as CatalogRow[];
  if (raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)) {
    return (raw as { data: CatalogRow[] }).data;
  }
  return [];
}

function mapCatalog(arr: CatalogRow[]): FactoryLaunch[] {
  const seen = new Set<string>();
  const launches: FactoryLaunch[] = [];
  for (const item of arr) {
    const mapped = mapCatalogItem(item);
    if (!mapped) continue;
    const key = mapped.token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    launches.push(mapped);
  }
  return launches;
}

async function fetchCatalogOnce(): Promise<FactoryLaunch[]> {
  const res = await fetch(PONS_GRADUATED_CATALOG_URL, {
    headers: { accept: "application/json", "user-agent": "line-radar/1.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const raw = (await res.json()) as unknown;
  return mapCatalog(rowsFromRaw(raw));
}

function cachedIfFresh(): CatalogPack | null {
  if (!lastGood || !lastGood.launches.length) return null;
  if (Date.now() - lastGood.at >= CATALOG_CACHE_MS) return null;
  return lastGood;
}

export async function harvestPonsGraduatedCatalog(): Promise<{ launches: FactoryLaunch[]; health: HealthSource }> {
  const name = "Pons graduated catalog";
  const t0 = Date.now();
  const cached = cachedIfFresh();
  if (cached) {
    return {
      launches: cached.launches,
      health: {
        name,
        ok: true,
        hits: 1,
        attempts: 1,
        ms: Date.now() - t0,
        detail: cached.launches.length + " graduated (cached)",
      },
    };
  }

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const launches = await fetchCatalogOnce();
      lastGood = { launches, at: Date.now() };
      return {
        launches,
        health: { name, ok: true, hits: 1, attempts: attempt, ms: Date.now() - t0, detail: launches.length + " graduated" },
      };
    } catch (err) {
      lastErr = err;
    }
  }

  if (lastGood && lastGood.launches.length) {
    return {
      launches: lastGood.launches,
      health: {
        name,
        ok: true,
        hits: 1,
        attempts: 2,
        ms: Date.now() - t0,
        detail: lastGood.launches.length + " graduated (last good)",
      },
    };
  }
  return { launches: [], health: fail(name, lastErr, t0, 2) };
}

