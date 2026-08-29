import { EXTREME_THIN_LP_USD, MARKET_THIN_LP_USD, THIN_LP_USD, type RiskLevel, type TokenRisk, type TokenRow } from "./types";

const RED_FLAGS = new Set(["HONEYPOT", "MINT AUTH", "FREEZE", "MINT-AUTH"]);

export type HolderRiskInput = {
  top10Pct?: number | null;
  bundlePct?: number | null;
  mintAuth?: boolean | null;
};

function knownNum(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v);
}

/**
 * GREEN only with real concentration data: top10 < 20 AND bundle < 15.
 * Missing top10 or bundle → never GREEN (AMBER or UNK).
 * RED if top10 > 30 or bundle > 25 or mint auth still on, or honeypot/freeze evidence.
 * Never invent 0s; omitted stats stay unknown.
 */
export function riskFromFlags(
  flags: string[],
  liqUsd?: number,
  mcapUsd?: number,
  holders?: HolderRiskInput,
): TokenRisk {
  const clean = flags.map((f) => f.trim().toUpperCase()).filter(Boolean);
  const drop = new Set(["UNCHECKED", "THIN LP", "UNK", "TOP10", "BUNDLE"]);
  const kept = clean.filter((f) => !drop.has(f));

  let red = false;
  for (const f of kept) {
    if (RED_FLAGS.has(f) || f === "HONEYPOT") red = true;
  }

  const mintOn = holders?.mintAuth === true;
  if (mintOn) {
    if (!kept.includes("MINT AUTH")) kept.push("MINT AUTH");
    red = true;
  }

  const top10 = holders?.top10Pct;
  const bundle = holders?.bundlePct;
  if (knownNum(top10) && top10 > 30) {
    if (!kept.includes("TOP10")) kept.push("TOP10");
    red = true;
  } else if (knownNum(top10) && top10 >= 20) {
    if (!kept.includes("TOP10")) kept.push("TOP10");
  }
  if (knownNum(bundle) && bundle > 25) {
    if (!kept.includes("BUNDLE")) kept.push("BUNDLE");
    red = true;
  } else if (knownNum(bundle) && bundle >= 15) {
    if (!kept.includes("BUNDLE")) kept.push("BUNDLE");
  }

  const liqKnown = liqUsd != null && Number.isFinite(liqUsd) && liqUsd > 0;
  const hasMarket = mcapUsd != null && Number.isFinite(mcapUsd) && mcapUsd > 0;
  let thin = false;
  if (liqKnown) {
    if (hasMarket && liqUsd! < MARKET_THIN_LP_USD) thin = true;
    if (hasMarket && mcapUsd! > 0 && liqUsd! < mcapUsd! * 0.02) thin = true;
    if (!hasMarket && liqUsd! < THIN_LP_USD) thin = true;
  }
  if (thin && !kept.includes("THIN LP")) kept.push("THIN LP");

  const topOk = knownNum(top10);
  const bundleOk = knownNum(bundle);
  if (!topOk && !bundleOk && !kept.includes("UNK")) kept.push("UNK");
  if (!liqKnown && !kept.includes("UNCHECKED")) kept.push("UNCHECKED");

  let level: RiskLevel;
  if (red) {
    level = "RED";
  } else if (topOk && bundleOk && top10 < 20 && bundle < 15 && !thin) {
    level = "GREEN";
  } else {
    level = "AMBER";
  }
  return { level, flags: kept };
}

/** Hide risky = RED + honeypot/mint-auth/freeze/extremely thin LP. AMBER stays. */
export function isHiddenRisky(row: TokenRow): boolean {
  if (row.risk.level === "RED") return true;
  const flags = row.risk.flags.map((f) => f.toUpperCase());
  if (flags.some((f) => RED_FLAGS.has(f))) return true;
  if ((row.liqUsd ?? Infinity) < EXTREME_THIN_LP_USD && row.liqUsd != null) return true;
  return false;
}
