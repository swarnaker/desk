import { isChain, isEvmCa, isSolMint, rowId } from "@/lib/line/ca";
import type { Chain, TokenRow } from "@/lib/line/types";
import { candToRow, mapDexChain, type Cand } from "./classify";
import { fetchLatestTokens, fetchTokenPairs } from "./dexscreener";
import { applyHoldersToRow, applyNullHolders, enrichHolders } from "./holders";
import { getSnapshot, listRadar } from "./radar";

export async function getToken(chain: Chain, ca: string): Promise<TokenRow | null> {
  if (chain === "solana" ? !isSolMint(ca) : !isEvmCa(ca)) return null;
  const id = rowId(chain, ca);
  const snap = getSnapshot();
  const hit = snap?.tokens.find((t) => t.id === id || t.ca.toLowerCase() === ca.toLowerCase());
  const { items: pairs } = await fetchTokenPairs(chain, ca);
  let extra = pairs;
  if (!extra.length) {
    const latest = await fetchLatestTokens(ca);
    extra = latest.items.filter((p) => mapDexChain(p.chainId) === chain);
  }
  const best = extra.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  const cand: Cand = {
    chain,
    ca,
    sources: new Set(hit?.sources || []),
    pair: best,
  };
  if (best) cand.sources.add("dex:token");
  const row = candToRow(cand);
  if (row && hit) {
    row.firstSeenAt = hit.firstSeenAt;
    if (!row.sources.includes("radar")) row.sources.push("radar");
  }
  const out = row ?? hit ?? null;
  if (!out) return null;
  const stats = await enrichHolders(out.chain, out.ca, best);
  return applyHoldersToRow(out, stats);
}

export async function resolveSearch(raw: string): Promise<{ chain: Chain; ca: string } | null> {
  const s = raw.trim();
  if (isSolMint(s)) return { chain: "solana", ca: s };
  if (!isEvmCa(s)) return null;
  const ca = s.toLowerCase();
  let payload = getSnapshot();
  if (!payload) payload = await listRadar();
  const hit = payload.tokens.find((t) => t.ca.toLowerCase() === ca);
  if (hit) return { chain: hit.chain, ca: hit.ca };
  const latest = await fetchLatestTokens(s);
  const chain = latest.items[0] ? mapDexChain(latest.items[0].chainId) : null;
  if (chain && isChain(chain)) return { chain, ca };
  return { chain: "robinhood", ca };
}
