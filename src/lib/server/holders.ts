import { rowId } from "@/lib/line/ca";
import type { Chain, TokenRow } from "@/lib/line/types";
import { riskFromFlags } from "@/lib/line/risk";
import type { DexPair } from "./dexscreener";

/** Holder / concentration stats. Missing source → null, never a fabricated 0. */
export type HolderEnrich = {
  holders: number | null;
  top10Pct: number | null;
  devPct: number | null;
  bundlePct: number | null;
  sniperPct: number | null;
  mintAuth: boolean | null;
  honeypot: boolean | null;
  deployer: string | null;
  launchpadMigrated: boolean | null;
  sources: string[];
};

const EMPTY: HolderEnrich = {
  holders: null,
  top10Pct: null,
  devPct: null,
  bundlePct: null,
  sniperPct: null,
  mintAuth: null,
  honeypot: null,
  deployer: null,
  launchpadMigrated: null,
  sources: [],
};

const CACHE_MS = 60_000;
const FAIL_MS = 20_000;
const GECKO_COOLDOWN_MS = 30_000;
const MIN_GAP_MS = 350;

type CacheEntry = { at: number; ttl: number; data: HolderEnrich };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<HolderEnrich>>();
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

/** True = mint still on. False = renounced/off. null = source omitted. */
function mintStillOn(v: unknown): boolean | null {
  if (v == null || v === "") return null;
  if (v === false || v === 0) return false;
  if (v === true || v === 1) return true;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (!s || s === "null" || s === "unknown" || s === "none") return null;
    if (s === "false" || s === "renounced" || s === "disabled" || s === "off" || s === "0") return false;
    if (s === "true" || s === "enabled" || s === "on" || s === "1") return true;
    if (s.length >= 20) return true;
  }
  return null;
}

function honeypotOn(v: unknown): boolean | null {
  if (v == null || v === "") return null;
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "yes" || s === "1") return true;
    if (s === "false" || s === "no" || s === "0") return false;
    return null;
  }
  return null;
}

function geckoNetwork(chain: Chain): string | null {
  if (chain === "base") return "base";
  if (chain === "solana") return "solana";
  if (chain === "robinhood") return "robinhood";
  return null;
}

function blockscoutTokenUrl(chain: Chain, ca: string): string | null {
  if (chain === "base") return "https://base.blockscout.com/api/v2/tokens/" + ca;
  if (chain === "robinhood") return "https://robinhoodchain.blockscout.com/api/v2/tokens/" + ca;
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

function takeDex(pair?: DexPair | null): Partial<HolderEnrich> {
  if (!pair) return {};
  const rec = pair as DexPair & {
    holders?: unknown;
    holderCount?: unknown;
    holdersCount?: unknown;
    info?: DexPair["info"] & { holders?: unknown; holderCount?: unknown };
  };
  const raw = rec.holders ?? rec.holderCount ?? rec.holdersCount ?? rec.info?.holders ?? rec.info?.holderCount;
  const holders = finiteNum(raw);
  return holders != null ? { holders } : {};
}

function takeGecko(data: unknown): Partial<HolderEnrich> {
  if (!data || typeof data !== "object") return {};
  const root = data as { data?: { attributes?: Record<string, unknown> }; attributes?: Record<string, unknown> };
  const attrs = root.data?.attributes || root.attributes;
  if (!attrs || typeof attrs !== "object") return {};
  const out: Partial<HolderEnrich> = {};
  const h = attrs.holders;
  if (h && typeof h === "object") {
    const ho = h as { count?: unknown; distribution_percentage?: { top_10?: unknown } };
    const count = finiteNum(ho.count);
    if (count != null) out.holders = count;
    const top = finiteNum(ho.distribution_percentage?.top_10);
    if (top != null) out.top10Pct = top;
  }
  const dev = finiteNum(attrs.developer_holding_percentage);
  if (dev != null) out.devPct = dev;
  const mint = mintStillOn(attrs.mint_authority);
  if (mint != null) out.mintAuth = mint;
  const hp = honeypotOn(attrs.is_honeypot);
  if (hp != null) out.honeypot = hp;
  const devAddr = attrs.developer_address;
  if (typeof devAddr === "string" && devAddr.trim().length >= 20 && !/^0x0+$/i.test(devAddr.trim())) {
    out.deployer = devAddr.trim();
  }
  const lp = attrs.launchpad_details;
  if (lp && typeof lp === "object") {
    const done = (lp as { completed?: unknown }).completed;
    if (done === true) out.launchpadMigrated = true;
    else if (done === false) out.launchpadMigrated = false;
  }
  return out;
}

function takeBlockscout(data: unknown): Partial<HolderEnrich> {
  if (!data || typeof data !== "object") return {};
  const rec = data as { holders_count?: unknown; holders?: unknown; holder_count?: unknown };
  const holders = finiteNum(rec.holders_count ?? rec.holders ?? rec.holder_count);
  return holders != null ? { holders } : {};
}

function merge(into: HolderEnrich, part: Partial<HolderEnrich>, source: string): void {
  if (!part || !Object.keys(part).length) return;
  let used = false;
  for (const k of ["holders", "top10Pct", "devPct", "bundlePct", "sniperPct", "mintAuth", "honeypot", "deployer", "launchpadMigrated"] as const) {
    if (part[k] != null && into[k] == null) {
      (into as unknown as Record<string, unknown>)[k] = part[k];
      used = true;
    }
  }
  if (used && !into.sources.includes(source)) into.sources.push(source);
}

async function fetchFresh(chain: Chain, ca: string, pair?: DexPair | null): Promise<HolderEnrich> {
  const out: HolderEnrich = { ...EMPTY, sources: [] };
  merge(out, takeDex(pair), "dex:pair");

  const net = geckoNetwork(chain);
  if (net && Date.now() >= geckoCoolUntil) {
    try {
      const url = "https://api.geckoterminal.com/api/v2/networks/" + net + "/tokens/" + ca + "/info";
      const { status, data } = await getJson(url);
      if (status === 429) geckoCoolUntil = Date.now() + GECKO_COOLDOWN_MS;
      else if (status >= 200 && status < 300) merge(out, takeGecko(data), "gecko:info");
    } catch {
      /* miss — leave nulls */
    }
  }

  if (out.holders == null) {
    const burl = blockscoutTokenUrl(chain, ca);
    if (burl) {
      try {
        const { status, data } = await getJson(burl);
        if (status >= 200 && status < 300) merge(out, takeBlockscout(data), "blockscout");
      } catch {
        /* miss */
      }
    }
  }

  return out;
}

export function peekHolders(chain: Chain, ca: string): HolderEnrich | null {
  const hit = cache.get(keyOf(chain, ca));
  if (!hit) return null;
  if (Date.now() - hit.at > hit.ttl) return null;
  return hit.data;
}

export async function enrichHolders(chain: Chain, ca: string, pair?: DexPair | null): Promise<HolderEnrich> {
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
      const data: HolderEnrich = { ...EMPTY, sources: [] };
      cache.set(k, { at: Date.now(), ttl: FAIL_MS, data });
      return data;
    } finally {
      inflight.delete(k);
    }
  })();
  inflight.set(k, job);
  return job;
}

export function applyHoldersToRow(row: TokenRow, h: HolderEnrich): TokenRow {
  row.holders = h.holders;
  row.top10Pct = h.top10Pct;
  row.devPct = h.devPct;
  row.bundlePct = h.bundlePct;
  row.sniperPct = h.sniperPct;
  row.mintAuth = h.mintAuth;
  if (!row.deployer && h.deployer) row.deployer = h.deployer;
  if (h.launchpadMigrated === true && row.pad === "PUMP" && row.stage === "ON_CURVE") {
    row.stage = "GRADUATED";
  }
  const flags = (row.risk?.flags || []).filter((f) => f !== "UNCHECKED" && f !== "THIN LP" && f !== "UNK" && f !== "TOP10" && f !== "BUNDLE");
  if (h.honeypot === true && !flags.some((f) => f.toUpperCase() === "HONEYPOT")) flags.push("HONEYPOT");
  row.risk = riskFromFlags(flags, row.liqUsd, row.mcapUsd, {
    top10Pct: h.top10Pct,
    bundlePct: h.bundlePct,
    mintAuth: h.mintAuth,
  });
  for (const s of h.sources) {
    if (!row.sources.includes(s)) row.sources.push(s);
  }
  return row;
}

export function applyNullHolders(row: TokenRow): TokenRow {
  if (row.holders === undefined) row.holders = null;
  if (row.top10Pct === undefined) row.top10Pct = null;
  if (row.devPct === undefined) row.devPct = null;
  if (row.bundlePct === undefined) row.bundlePct = null;
  if (row.sniperPct === undefined) row.sniperPct = null;
  if (row.mintAuth === undefined) row.mintAuth = null;
  row.risk = riskFromFlags(
    (row.risk?.flags || []).filter((f) => f !== "UNCHECKED" && f !== "THIN LP" && f !== "UNK"),
    row.liqUsd,
    row.mcapUsd,
    { top10Pct: row.top10Pct, bundlePct: row.bundlePct, mintAuth: row.mintAuth },
  );
  return row;
}
