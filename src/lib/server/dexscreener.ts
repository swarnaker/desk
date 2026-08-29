import type { HealthSource } from "@/lib/line/types";
import { fail } from "./http";

export type DexTxn = { buys?: number; sells?: number; buyers?: number; sellers?: number; makers?: number };
export type DexPair = {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  labels?: string[];
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  txns?: { m5?: DexTxn; h1?: DexTxn; h6?: DexTxn; h24?: DexTxn };
  volume?: { h24?: number; h6?: number; h1?: number; m5?: number };
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  makers?: number;
  boosts?: { active?: number } | number;
  info?: {
    imageUrl?: string;
    websites?: Array<{ url?: string; label?: string } | string>;
    socials?: Array<{ url?: string; type?: string } | string>;
  };
};

/** Unique makers / boosts from a Dex pair. Missing fields stay null — never invent 0. */
export function pairMakers(pair?: DexPair | null): {
  uniqueBuyers1h: number | null;
  uniqueSellers1h: number | null;
  boostsActive: number | null;
} {
  if (!pair) return { uniqueBuyers1h: null, uniqueSellers1h: null, boostsActive: null };
  const h1 = pair.txns?.h1;
  const buyers = numOrNull(h1?.buyers) ?? numOrNull(h1?.makers);
  const sellers = numOrNull(h1?.sellers);
  const boostRaw = typeof pair.boosts === "number" ? pair.boosts : pair.boosts?.active;
  const boostsActive = numOrNull(boostRaw);
  return {
    uniqueBuyers1h: buyers ?? null,
    uniqueSellers1h: sellers ?? null,
    boostsActive: boostsActive ?? null,
  };
}

function dsBase(): string {
  return (process.env.DEXSCREENER_BASE_URL || "https://api.dexscreener.com").replace(/\/$/, "");
}

async function dsGet<T>(path: string, source: string): Promise<{ data: T | null; health: HealthSource }> {
  const t0 = Date.now();
  const url = dsBase() + path;
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "line-radar/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    const ms = Date.now() - t0;
    if (!res.ok) {
      return { data: null, health: { name: source, ok: false, hits: 0, attempts: 1, ms, detail: "HTTP " + res.status } };
    }
    const data = (await res.json()) as T;
    return { data, health: { name: source, ok: true, hits: 1, attempts: 1, ms } };
  } catch (err) {
    return { data: null, health: fail(source, err, t0) };
  }
}

export async function fetchDexSearch(q: string): Promise<{ items: DexPair[]; health: HealthSource }> {
  const { data, health } = await dsGet<{ pairs?: DexPair[] | null }>(
    "/latest/dex/search?q=" + encodeURIComponent(q),
    "DexScreener search " + q,
  );
  return { items: data?.pairs || [], health };
}

export async function fetchTokenPairs(chainId: string, token: string): Promise<{ items: DexPair[]; health: HealthSource }> {
  const { data, health } = await dsGet<DexPair[] | { pairs?: DexPair[] }>(
    "/token-pairs/v1/" + chainId + "/" + token,
    "DexScreener pairs " + chainId,
  );
  const items = Array.isArray(data) ? data : data?.pairs || [];
  return { items, health };
}

export async function fetchTokensV1(chainId: string, addresses: string[]): Promise<{ items: DexPair[]; health: HealthSource }> {
  if (!addresses.length) {
    return { items: [], health: { name: "DexScreener tokens/" + chainId, ok: true, hits: 0, attempts: 0, ms: 0 } };
  }
  const { data, health } = await dsGet<DexPair[] | { pairs?: DexPair[] }>(
    "/tokens/v1/" + chainId + "/" + addresses.join(","),
    "DexScreener tokens/" + chainId,
  );
  const items = Array.isArray(data) ? data : data?.pairs || [];
  return { items, health };
}

export async function fetchTokensV1Batched(
  chainId: string,
  addresses: string[],
  batchSize = 30,
  concurrency = 4,
): Promise<{ items: DexPair[]; health: HealthSource }> {
  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const a of addresses) {
    const k = (a || "").toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    uniq.push(a);
  }
  const name = "DexScreener pair metrics " + chainId;
  if (!uniq.length) {
    return { items: [], health: { name, ok: true, hits: 0, attempts: 0, ms: 0 } };
  }
  const t0 = Date.now();
  const batches: string[][] = [];
  for (let i = 0; i < uniq.length; i += batchSize) batches.push(uniq.slice(i, i + batchSize));
  let hits = 0;
  const items: DexPair[] = [];
  for (let i = 0; i < batches.length; i += concurrency) {
    const part = batches.slice(i, i + concurrency);
    const results = await Promise.all(part.map((b) => fetchTokensV1(chainId, b)));
    for (const r of results) {
      if (r.health.ok) hits += 1;
      items.push(...r.items);
    }
  }
  return {
    items,
    health: {
      name,
      ok: hits > 0,
      hits,
      attempts: batches.length,
      ms: Date.now() - t0,
      detail: items.length + " pairs / " + uniq.length + " addrs",
    },
  };
}

export async function fetchLatestTokens(token: string): Promise<{ items: DexPair[]; health: HealthSource }> {
  const { data, health } = await dsGet<{ pairs?: DexPair[] | null }>(
    "/latest/dex/tokens/" + token,
    "DexScreener latest/tokens",
  );
  return { items: data?.pairs || [], health };
}

export function pairWebsites(pair: DexPair): string[] {
  const out: string[] = [];
  for (const w of pair.info?.websites || []) {
    if (typeof w === "string") out.push(w);
    else if (w?.url) out.push(w.url);
  }
  return out;
}

export function pairX(pair: DexPair): string | undefined {
  for (const s of pair.info?.socials || []) {
    const url = typeof s === "string" ? s : s?.url;
    const type = typeof s === "string" ? "" : (s?.type || "");
    if (!url) continue;
    if (/twitter|x\.com/i.test(type) || /x\.com|twitter\.com/i.test(url)) {
      try {
        const u = new URL(url.startsWith("http") ? url : "https://" + url);
        const h = u.pathname.replace(/^\//, "").split("/")[0];
        if (h) return h.replace(/^@/, "");
      } catch {
        /* skip */
      }
    }
  }
  return undefined;
}

export function numOrNull(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}
