import { isEvmCa, isSolMint, rowId } from "./ca";
import type { Chain } from "./types";

export const WATCH_KEY = "line.watch.v1";
export const WATCH_CHANGE_EVENT = "line:watch";

export type WatchItem = {
  chain: Chain;
  ca: string;
  first?: boolean;
  addedAt: string;
};

export type WatchFileV1 = {
  version: 1;
  items: WatchItem[];
};

export function emptyWatch(): WatchFileV1 {
  return { version: 1, items: [] };
}

function validItem(it: unknown): WatchItem | null {
  if (!it || typeof it !== "object") return null;
  const o = it as Record<string, unknown>;
  const chain = o.chain;
  const ca = typeof o.ca === "string" ? o.ca.trim() : "";
  if (chain !== "robinhood" && chain !== "base" && chain !== "solana") return null;
  if (chain === "solana" ? !isSolMint(ca) : !isEvmCa(ca)) return null;
  return {
    chain,
    ca: chain === "solana" ? ca : ca.toLowerCase(),
    first: o.first === true,
    addedAt: typeof o.addedAt === "string" ? o.addedAt : new Date().toISOString(),
  };
}

/** Merge import. Never wipe. Drop invalid CAs. Incoming first flag ORs existing. */
export function mergeWatch(current: WatchFileV1, incoming: unknown): WatchFileV1 {
  const src = Array.isArray((incoming as WatchFileV1)?.items)
    ? (incoming as WatchFileV1).items
    : Array.isArray(incoming)
      ? incoming
      : [];
  const map = new Map<string, WatchItem>();
  for (const it of current.items) {
    const v = validItem(it);
    if (v) map.set(rowId(v.chain, v.ca), v);
  }
  for (const it of src) {
    const v = validItem(it);
    if (!v) continue;
    const k = rowId(v.chain, v.ca);
    const prev = map.get(k);
    if (!prev) map.set(k, v);
    else map.set(k, { ...prev, first: prev.first || v.first });
  }
  return { version: 1, items: [...map.values()] };
}

export function parseWatchJson(text: string): WatchFileV1 {
  try {
    const parsed = JSON.parse(text) as unknown;
    return mergeWatch(emptyWatch(), parsed);
  } catch {
    return emptyWatch();
  }
}

export function watchSet(file: WatchFileV1): Set<string> {
  const s = new Set<string>();
  for (const it of file.items) {
    s.add(rowId(it.chain, it.ca).toLowerCase());
    s.add(it.ca.toLowerCase());
  }
  return s;
}

/** `watched=base:0x...,solana:Mint` → set of chain:ca and bare ca (lowercase). */
export function parseWatchedQuery(raw: string | null | undefined): Set<string> {
  const s = new Set<string>();
  if (!raw) return s;
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (!t) continue;
    s.add(t.toLowerCase());
    const colon = t.indexOf(":");
    if (colon > 0) s.add(t.slice(colon + 1).toLowerCase());
  }
  return s;
}
