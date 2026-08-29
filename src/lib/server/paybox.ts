import { deskPublicUrl, formatProposeDraft, PROPOSE_USD } from "@/lib/line/propose";
import { EM, formatAge, formatPct, formatUsd } from "@/lib/line/format";
import type { HealthSource, TokenRow } from "@/lib/line/types";

/** Radar/health bit. Always draft-only. Never includes URL or secrets. */
export function payboxHealth(): HealthSource {
  return {
    name: "paybox",
    ok: true,
    hits: 1,
    attempts: 1,
    ms: 0,
    detail: "draft only",
  };
}

export function attachPayboxHealth(health?: {
  sources?: HealthSource[];
  hits?: number;
  attempts?: number;
} | null): { sources: HealthSource[]; hits: number; attempts: number } {
  const pb = payboxHealth();
  const sources = (health?.sources ?? []).filter((s) => (s.name || "").toLowerCase() !== "paybox");
  sources.push(pb);
  return {
    sources,
    hits: (health?.hits ?? 0) + pb.hits,
    attempts: (health?.attempts ?? 0) + pb.attempts,
  };
}

function intentTemplate(raw: string): boolean {
  return raw.includes("{ca}") || raw.includes("{symbol}") || raw.includes("{chain}");
}

/** Intent URL only. Never credentials. Missing/blank env → null. */
export function buildPayboxIntentUrl(row: TokenRow): string | null {
  const raw = (process.env.PAYBOX_INTENT_URL || "").trim();
  if (!raw) return null;
  if (intentTemplate(raw)) {
    return raw
      .split("{ca}").join(encodeURIComponent(row.ca))
      .split("{symbol}").join(encodeURIComponent(row.symbol || ""))
      .split("{chain}").join(encodeURIComponent(row.chain));
  }
  try {
    const u = new URL(raw);
    u.searchParams.set("symbol", row.symbol || "");
    u.searchParams.set("chain", row.chain);
    u.searchParams.set("ca", row.ca);
    u.searchParams.set("pad", row.pad);
    u.searchParams.set("amount", String(PROPOSE_USD));
    u.searchParams.set("age", formatAge(row.ageSec));
    u.searchParams.set("vol1h", formatUsd(row.vol1hUsd));
    u.searchParams.set("buyers1h", row.uniqueBuyers1h != null ? String(row.uniqueBuyers1h) : EM);
    u.searchParams.set("mcap", formatUsd(row.mcapUsd));
    u.searchParams.set("top10", formatPct(row.top10Pct));
    u.searchParams.set("desk", deskPublicUrl(row));
    return u.toString();
  } catch {
    return null;
  }
}

export function proposePayload(row: TokenRow): { ok: true; text: string; intentUrl: string | null } {
  return {
    ok: true,
    text: formatProposeDraft(row),
    intentUrl: buildPayboxIntentUrl(row),
  };
}
