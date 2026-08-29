import { tickerKey } from "./filters";
import { EM, formatAge, formatPct, formatUsd } from "./format";
import { physicsBits } from "./physics";
import type { TokenRow } from "./types";

export const FAKE_MAJOR_TICKERS = new Set([
  "LINK",
  "ROBINHOOD",
  "BTC",
  "ETH",
  "SOL",
  "WBTC",
  "WETH",
  "WSOL",
]);

export const PROPOSE_USD = 8;
export const PROPOSE_COOLDOWN_MS = 30 * 60 * 1000;
export const PROPOSE_MIN_AGE_SEC = 3600;
export const PROPOSE_MIN_BUYERS = 20;
export const PROPOSE_MIN_VOL1H = 8000;

export const DESK_PUBLIC_ORIGIN = "https://desk-jxwk.vercel.app";

function deskUrl(row: Pick<TokenRow, "chain" | "ca">): string {
  return DESK_PUBLIC_ORIGIN + "/t/" + row.chain + "/" + row.ca;
}

function isPumpMigrated(row: TokenRow): boolean {
  if (row.pad !== "PUMP") return false;
  if (row.stage === "ON_CURVE" || row.stage === "FACTORY" || row.stage === "ANTI_SNIPE") return false;
  if (row.stage === "GRADUATED" || row.stage === "MOVING") return true;
  const bits = physicsBits({
    pad: row.pad,
    stage: row.stage,
    quote: row.quote,
    curveFillPct: row.curveFillPct,
    taxEndsAt: row.taxEndsAt,
    ageSec: row.ageSec,
    liqUsd: row.liqUsd,
    padSub: row.padSub,
  });
  return bits.kind === "migrated";
}

function padEligible(row: TokenRow): boolean {
  return row.pad === "PONS" || row.pad === "O1" || isPumpMigrated(row);
}

function stageEligible(row: TokenRow): boolean {
  return row.stage === "GRADUATED" || row.stage === "LIVE_POOL" || row.stage === "MOVING";
}

export function canPropose(row: TokenRow | null | undefined): { ok: boolean; reason?: string } {
  if (!row || !row.ca || !row.chain) return { ok: false, reason: "empty" };
  if (!padEligible(row)) return { ok: false, reason: "pad" };
  if (!stageEligible(row)) return { ok: false, reason: "stage" };
  if (row.ageSec == null || !Number.isFinite(row.ageSec) || row.ageSec < PROPOSE_MIN_AGE_SEC) {
    return { ok: false, reason: "age" };
  }
  const buyersOk = row.uniqueBuyers1h != null && row.uniqueBuyers1h >= PROPOSE_MIN_BUYERS;
  const volOk = (row.vol1hUsd ?? 0) >= PROPOSE_MIN_VOL1H;
  if (!buyersOk && !volOk) return { ok: false, reason: "activity" };
  if (row.risk?.level === "RED") return { ok: false, reason: "risk" };
  if (FAKE_MAJOR_TICKERS.has(tickerKey(row.symbol))) return { ok: false, reason: "ticker" };
  return { ok: true };
}

export function formatProposeDraft(row: TokenRow): string {
  const buyers = row.uniqueBuyers1h != null ? String(row.uniqueBuyers1h) : EM;
  return [
    "PayBox Always Ask",
    "Buy $" + PROPOSE_USD + " of " + (row.symbol || EM),
    "chain=" + row.chain,
    "ca=" + row.ca,
    "pad=" + row.pad
      + " age=" + formatAge(row.ageSec)
      + " vol1h=" + formatUsd(row.vol1hUsd)
      + " buyers1h=" + buyers
      + " mcap=" + formatUsd(row.mcapUsd)
      + " top10=" + formatPct(row.top10Pct),
    deskUrl(row),
  ].join("\n");
}

export function deskPublicUrl(row: Pick<TokenRow, "chain" | "ca">): string {
  return deskUrl(row);
}
