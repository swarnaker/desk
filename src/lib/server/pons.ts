import {
  isProtocol, isQuoteAddr, PONS_GRADUATED_CATALOG_URL,
} from "@/lib/line/constants";
import type { HealthSource } from "@/lib/line/types";
import type { FactoryLaunch } from "./factory";
import { fail } from "./http";

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

export async function harvestPonsGraduatedCatalog(): Promise<{ launches: FactoryLaunch[]; health: HealthSource }> {
  const name = "Pons graduated catalog";
  const t0 = Date.now();
  try {
    const res = await fetch(PONS_GRADUATED_CATALOG_URL, {
      headers: { accept: "application/json", "user-agent": "line-radar/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    const ms = Date.now() - t0;
    if (!res.ok) {
      return { launches: [], health: { name, ok: false, hits: 0, attempts: 1, ms, detail: "HTTP " + res.status } };
    }
    const raw = (await res.json()) as unknown;
    const arr: CatalogRow[] = Array.isArray(raw)
      ? raw as CatalogRow[]
      : (raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)
        ? (raw as { data: CatalogRow[] }).data
        : []);
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
    return {
      launches,
      health: { name, ok: true, hits: 1, attempts: 1, ms, detail: launches.length + " graduated" },
    };
  } catch (err) {
    return { launches: [], health: fail(name, err, t0) };
  }
}

