import { rowId } from "@/lib/line/ca";
import type { Chain, TokenRow } from "@/lib/line/types";
import { pairMakers, type DexPair } from "./dexscreener";

/** Unique makers / boosts. Missing source → null, never a fabricated 0. */
export type MakerEnrich = {
  uniqueBuyers1h: number | null;
  uniqueSellers1h: number | null;
  boostsActive: number | null;
  sources: string[];
};

const EMPTY: MakerEnrich = {
  uniqueBuyers1h: null,
  uniqueSellers1h: null,
  boostsActive: null,
  sources: [],
};

const CACHE_MS = 60_000;
const FAIL_MS = 20_000;
const GECKO_COOLDOWN_MS = 30_000;
const MIN_GAP_MS = 350;

type CacheEntry = { at: number; ttl: number; data: MakerEnrich };
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<MakerEnrich>>();
let geckoCoolUntil = 0;
let lastOutAt = 0;

function keyOf(chain: Chain, ca: string): string {
  return rowId(chain, ca);
}

function finiteNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function geckoNetwork(chain: Chain): string | null {
  if (chain === "base") return "base";
  if (chain === "solana") return "solana";
  if (chain === "robinhood") return "robinhood";
  return null;
}

async function gap(): Promise<void> {
  const wait = lastOutAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastOutAt = Date.now();
}

async function getJson(url: string, timeoutMs = 8000): Promise<{ status: number; data: unknown }> {
  await gap();
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "line-radar/1.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

function takeDex(pair?: DexPair | null): Partial<MakerEnrich> {
  const m = pairMakers(pair);
  const out: Partial<MakerEnrich> = {};
  if (m.uniqueBuyers1h != null) out.uniqueBuyers1h = m.uniqueBuyers1h;
  if (m.uniqueSellers1h != null) out.uniqueSellers1h = m.uniqueSellers1h;
  if (m.boostsActive != null) out.boostsActive = m.boostsActive;
  return out;
}

type GeckoH1 = { buyers?: unknown; sellers?: unknown; buys?: unknown; sells?: unknown };
type GeckoPoolRow = {
  id?: string;
  attributes?: {
    address?: string;
    reserve_in_usd?: unknown;
    transactions?: { h1?: GeckoH1 };
  };
};

function geckoPoolRows(data: unknown): GeckoPoolRow[] {
  if (!data || typeof data !== "object") return [];
  const root = data as { data?: unknown };
  if (Array.isArray(root.data)) return root.data as GeckoPoolRow[];
  if (root.data && typeof root.data === "object") return [root.data as GeckoPoolRow];
  return [];
}

function geckoPoolAddr(row: GeckoPoolRow): string {
  const a = (row.attributes?.address || "").toLowerCase();
  if (a) return a;
  const id = (row.id || "").toLowerCase();
  const i = id.lastIndexOf("_");
  return i >= 0 ? id.slice(i + 1) : id;
}

function takeGeckoPools(data: unknown, pairAddress?: string | null): Partial<MakerEnrich> {
  const want = (pairAddress || "").toLowerCase();
  type Scored = { buyers: number | null; sellers: number | null; reserve: number; match: boolean };
  const scored: Scored[] = [];
  for (const row of geckoPoolRows(data)) {
    const h1 = row.attributes?.transactions?.h1;
    if (!h1 || typeof h1 !== "object") continue;
    const hasBuyers = Object.prototype.hasOwnProperty.call(h1, "buyers");
    const hasSellers = Object.prototype.hasOwnProperty.call(h1, "sellers");
    if (!hasBuyers && !hasSellers) continue;
    const buyers = hasBuyers ? finiteNum(h1.buyers) : null;
    const sellers = hasSellers ? finiteNum(h1.sellers) : null;
    if (buyers == null && sellers == null) continue;
    const buys = finiteNum(h1.buys) ?? 0;
    const sells = finiteNum(h1.sells) ?? 0;
    const txns = buys + sells;
    // Dead pool: buyers:0 and buys+sells=0 is not a real unique count — do not invent 0.
    const useBuyers = buyers != null && !(buyers === 0 && txns === 0);
    const useSellers = sellers != null && !(sellers === 0 && txns === 0);
    if (!useBuyers && !useSellers) continue;
    scored.push({
      buyers: useBuyers ? buyers : null,
      sellers: useSellers ? sellers : null,
      reserve: finiteNum(row.attributes?.reserve_in_usd) ?? 0,
      match: !!want && geckoPoolAddr(row) === want,
    });
  }
  if (!scored.length) return {};
  const matched = want ? scored.filter((s) => s.match) : [];
  const pick = (matched.length ? matched : scored).slice().sort((a, b) => b.reserve - a.reserve)[0];
  const out: Partial<MakerEnrich> = {};
  if (pick.buyers != null) out.uniqueBuyers1h = pick.buyers;
  if (pick.sellers != null) out.uniqueSellers1h = pick.sellers;
  return out;
}

function merge(into: MakerEnrich, part: Partial<MakerEnrich>, source: string): void {
  if (!part || !Object.keys(part).length) return;
  let used = false;
  for (const k of ["uniqueBuyers1h", "uniqueSellers1h", "boostsActive"] as const) {
    if (part[k] != null && into[k] == null) {
      into[k] = part[k] as number;
      used = true;
    }
  }
  if (used && !into.sources.includes(source)) into.sources.push(source);
}

async function fetchFresh(chain: Chain, ca: string, pair?: DexPair | null): Promise<MakerEnrich> {
  const out: MakerEnrich = { ...EMPTY, sources: [] };
  merge(out, takeDex(pair), "dex:pair");
  if (out.uniqueBuyers1h != null) return out;
  const net = geckoNetwork(chain);
  const pairAddr = pair?.pairAddress;
  if (net && Date.now() >= geckoCoolUntil && pairAddr) {
    try {
      const url = "https://api.geckoterminal.com/api/v2/networks/" + net + "/pools/" + pairAddr;
      const { status, data } = await getJson(url);
      if (status === 429) geckoCoolUntil = Date.now() + GECKO_COOLDOWN_MS;
      else if (status >= 200 && status < 300) merge(out, takeGeckoPools(data, pairAddr), "gecko:pool");
    } catch {
      /* miss — leave nulls */
    }
  }
  if (out.uniqueBuyers1h != null) return out;
  if (net && Date.now() >= geckoCoolUntil) {
    try {
      const url = "https://api.geckoterminal.com/api/v2/networks/" + net + "/tokens/" + ca + "/pools";
      const { status, data } = await getJson(url);
      if (status === 429) geckoCoolUntil = Date.now() + GECKO_COOLDOWN_MS;
      else if (status >= 200 && status < 300) merge(out, takeGeckoPools(data, pairAddr), "gecko:pools");
    } catch {
      /* miss — leave nulls */
    }
  }
  return out;
}

export function peekMakers(chain: Chain, ca: string): MakerEnrich | null {
  const hit = cache.get(keyOf(chain, ca));
  if (!hit) return null;
  if (Date.now() - hit.at > hit.ttl) return null;
  return hit.data;
}

export async function enrichMakers(chain: Chain, ca: string, pair?: DexPair | null): Promise<MakerEnrich> {
  const k = keyOf(chain, ca);
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at <= hit.ttl) return hit.data;
  const running = inflight.get(k);
  if (running) return running;
  const job = (async () => {
    try {
      const data = await fetchFresh(chain, ca, pair);
      cache.set(k, { at: Date.now(), ttl: CACHE_MS, data });
      return data;
    } catch {
      const data: MakerEnrich = { ...EMPTY, sources: [] };
      cache.set(k, { at: Date.now(), ttl: FAIL_MS, data });
      return data;
    } finally {
      inflight.delete(k);
    }
  })();
  inflight.set(k, job);
  return job;
}

export function applyMakersToRow(row: TokenRow, m: MakerEnrich): TokenRow {
  if (row.uniqueBuyers1h == null && m.uniqueBuyers1h != null) row.uniqueBuyers1h = m.uniqueBuyers1h;
  if (row.uniqueSellers1h == null && m.uniqueSellers1h != null) row.uniqueSellers1h = m.uniqueSellers1h;
  if (row.boostsActive == null && m.boostsActive != null) row.boostsActive = m.boostsActive;
  for (const s of m.sources) {
    if (!row.sources.includes(s)) row.sources.push(s);
  }
  return row;
}

export function applyNullMakers(row: TokenRow): TokenRow {
  if (row.uniqueBuyers1h === undefined) row.uniqueBuyers1h = null;
  if (row.uniqueSellers1h === undefined) row.uniqueSellers1h = null;
  if (row.boostsActive === undefined) row.boostsActive = null;
  return row;
}
