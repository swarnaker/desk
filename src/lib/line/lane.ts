import { DAY, HOUR, STRETCH_FILL, WAKE_UNIQUE_BUYERS_MIN, type Lane, type Pad, type Stage, type TokenRow } from "./types";

/** PONS/PUMP still on the bonding curve. o1 is never on-curve. */
export function isOnCurve(row: { pad: Pad; stage: Stage }): boolean {
  if (row.pad === "O1") return false;
  return (row.pad === "PONS" || row.pad === "PUMP") && row.stage === "ON_CURVE";
}

/** Locked-v4 / graduated book. */
function isLockedV4(pad: Pad, stage: Stage): boolean {
  if (pad === "O1") return stage === "LIVE_POOL" || stage === "GRADUATED" || stage === "MOVING";
  if (pad === "PONS") return stage === "GRADUATED" || stage === "LIVE_POOL" || stage === "MOVING";
  if (pad === "PUMP") return stage === "GRADUATED" || stage === "MOVING";
  return false;
}

/**
 * Survived = graduated / moving / locked-v4 / o1 live. Never raw ON_CURVE.
 * BASE: not ON_CURVE; LIVE_POOL/GRADUATED/MOVING; CASHCAT padSub RH with liq is survived book.
 */
export function isSurvived(row: {
  pad: Pad;
  stage: Stage;
  padSub?: string;
  liqUsd?: number;
}): boolean {
  if (row.pad === "O1") {
    return row.stage === "LIVE_POOL" || row.stage === "GRADUATED" || row.stage === "MOVING";
  }
  if (row.pad === "PONS") {
    return row.stage === "GRADUATED" || row.stage === "MOVING" || row.stage === "LIVE_POOL";
  }
  if (row.pad === "PUMP") {
    return row.stage === "GRADUATED" || row.stage === "MOVING";
  }
  if (row.stage === "ON_CURVE") return false;
  if (row.stage === "LIVE_POOL" || row.stage === "GRADUATED" || row.stage === "MOVING") return true;
  if (row.padSub === "RH" && (row.liqUsd ?? 0) > 0) return true;
  return false;
}

export function isStretchException(opts: {
  pad: Pad;
  stage: Stage;
  curveFillPct?: number;
}): boolean {
  // ON_CURVE Pons/Pump fill >= 0.70. Never treat o1 curve. Never graduated.
  if (!isOnCurve(opts)) return false;
  return (opts.curveFillPct ?? 0) >= STRETCH_FILL;
}

function isLockedMajor(opts: { pad: Pad; stage: Stage; padSub?: string; liqUsd?: number }): boolean {
  if (isLockedV4(opts.pad, opts.stage)) return true;
  if (opts.pad === "BASE" && opts.padSub === "RH" && (opts.liqUsd ?? 0) > 0) return true;
  return false;
}

export function inferLane(opts: {
  pad: Pad;
  stage: Stage;
  ageSec?: number;
  curveFillPct?: number;
  printing: boolean;
  factoryOnly: boolean;
  vol1hUsd?: number;
  moving?: boolean;
  padSub?: string;
  liqUsd?: number;
}): Lane {
  const age = opts.ageSec;
  const fill = opts.pad === "O1" ? undefined : opts.curveFillPct;

  // STRETCH = ON_CURVE AND fill >= 0.70 AND (Pons/Pump). o1 never STRETCH.
  // Server still tags these so when Curve is on they land in STRETCH.
  if (isOnCurve(opts) && (fill ?? 0) >= STRETCH_FILL) {
    return "STRETCH";
  }

  if (isSurvived(opts)) {
    // BOOK = survived AND age >= 24h (or missing age on a locked major).
    if (age == null && isLockedMajor(opts)) return "BOOK";
    if (age != null && age >= DAY) return "BOOK";
    // NEW = survived AND age < 24h (typically age >= 6h via default gate).
    // o1 6h–24h LIVE_POOL → NEW. 1h/2h chips can put younger survived names here.
    return "NEW";
  }

  // Factory-only FACTORY / raw ON_CURVE: lane can be NEW; bonding+age gates hide them.
  return "NEW";
}

const MAX_BIRTH_AGE_SEC = 70 * 86400;
const WAKE_VOL_FLOOR = 25_000;

/** BIRTH pill only on NEW: survived, not raw curve, age < 24h, never 70-day, never BOOK. */
export function computeBirth(row: {
  pad: Pad;
  stage: Stage;
  ageSec?: number;
  padSub?: string;
  liqUsd?: number;
}): boolean {
  if (!isSurvived(row)) return false;
  if (isOnCurve(row)) return false;
  const age = row.ageSec;
  if (age == null) return false;
  if (age >= MAX_BIRTH_AGE_SEC) return false;
  if (age >= DAY) return false;
  return true;
}

/** WAKE = age >= 24h AND vol1hUsd >= max(3*(vol24hUsd/24), 25000) AND uniqueBuyers1h >= 15.
 *  Missing uniqueBuyers1h → skip WAKE (never invent 0). Dust cannot WAKE. */
export function computeWake(row: {
  pad?: Pad;
  ageSec?: number;
  vol1hUsd?: number;
  vol24hUsd?: number;
  uniqueBuyers1h?: number | null;
}): boolean {
  if (row.pad !== "PONS" && row.pad !== "O1") return false;
  if (row.ageSec == null || row.ageSec < DAY) return false;
  if (row.vol1hUsd == null) return false;
  const vol24 = row.vol24hUsd;
  const hourly = vol24 != null && vol24 > 0 ? vol24 / 24 : 0;
  const bar = Math.max(3 * hourly, WAKE_VOL_FLOOR);
  if (row.vol1hUsd < bar) return false;
  if (row.uniqueBuyers1h == null || row.uniqueBuyers1h < WAKE_UNIQUE_BUYERS_MIN) return false;
  return true;
}

/** Movers first, then heat desc. RED cannot outrank a green mover. */
export function sortLane(rows: TokenRow[]): TokenRow[] {
  return [...rows].sort((a, b) => {
    const aGreenMover = a.moving && a.risk.level === "GREEN" ? 1 : 0;
    const bGreenMover = b.moving && b.risk.level === "GREEN" ? 1 : 0;
    if (aGreenMover !== bGreenMover) return bGreenMover - aGreenMover;
    const aRed = a.risk.level === "RED" ? 1 : 0;
    const bRed = b.risk.level === "RED" ? 1 : 0;
    if (aRed !== bRed) return aRed - bRed;
    const am = a.moving ? 1 : 0;
    const bm = b.moving ? 1 : 0;
    if (am !== bm) return bm - am;
    if (a.heat !== b.heat) return b.heat - a.heat;
    return (b.firstSeenAt || "").localeCompare(a.firstSeenAt || "");
  });
}

export function splitLanes(rows: TokenRow[]): Record<Lane, TokenRow[]> {
  const out: Record<Lane, TokenRow[]> = { NEW: [], STRETCH: [], BOOK: [] };
  for (const r of rows) out[r.lane].push(r);
  out.NEW = sortLane(out.NEW);
  out.STRETCH = sortLane(out.STRETCH);
  out.BOOK = sortLane(out.BOOK);
  return out;
}
