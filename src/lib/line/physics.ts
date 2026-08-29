import { O1_TAX_SEC, PONS_TAX_SEC, type Pad, type Quote, type Stage } from "./types";

export type PhysicsBits = {
  primary: string;
  secondary?: string;
  quote?: Quote;
  taxLeftSec?: number;
  kind: "curve" | "tax" | "locked" | "bond" | "migrated" | "pair" | "factory";
};

const EM = "—";

function taxLeft(taxEndsAt?: string, now = Date.now()): number | undefined {
  if (!taxEndsAt) return undefined;
  const t = Date.parse(taxEndsAt);
  if (!Number.isFinite(t)) return undefined;
  return Math.max(0, Math.round((t - now) / 1000));
}

/** o1 never returns CURVE xx%. curveFillPct ignored unless Pons/Pump. Never age/liq on o1. */
export function physicsBits(opts: {
  pad: Pad;
  stage: Stage;
  quote: Quote;
  curveFillPct?: number;
  taxEndsAt?: string;
  ageSec?: number;
  liqUsd?: number;
  padSub?: string;
  now?: number;
}): PhysicsBits {
  const now = opts.now ?? Date.now();
  const left = taxLeft(opts.taxEndsAt, now);

  // RH mascot (CASHCAT): never Pons curve, never age/liq in this slot.
  if (opts.padSub === "RH") {
    if ((opts.liqUsd ?? 0) > 0) return { primary: "LOCKED V4", quote: opts.quote, kind: "locked" };
    return { primary: EM, kind: "locked" };
  }

  if (opts.pad === "O1") {
    if (left != null && left > 0) {
      return { primary: "TAX " + left + "s", quote: opts.quote, taxLeftSec: left, kind: "tax" };
    }
    return { primary: "LOCKED V4", quote: opts.quote, kind: "locked" };
  }

  if (opts.pad === "PONS") {
    if (opts.stage === "GRADUATED" || opts.stage === "MOVING" || opts.stage === "LIVE_POOL") {
      const bits: PhysicsBits = { primary: "LOCKED V4", quote: opts.quote, kind: "locked" };
      if (opts.stage === "MOVING") bits.secondary = "MOVING";
      return bits;
    }
    const pct = opts.curveFillPct != null ? Math.round(opts.curveFillPct * 100) : null;
    const primary = pct != null ? "CURVE " + pct + "%" : "CURVE " + EM;
    const out: PhysicsBits = { primary, quote: opts.quote, kind: "curve" };
    if (left != null && left > 0) {
      out.secondary = "TAX " + left + "s";
      out.taxLeftSec = left;
    }
    return out;
  }

  if (opts.pad === "PUMP") {
    if (opts.stage === "GRADUATED" || opts.stage === "MOVING") {
      return { primary: "MIGRATED", quote: opts.quote, kind: "migrated" };
    }
    const pct = opts.curveFillPct != null ? Math.round(opts.curveFillPct * 100) : null;
    return { primary: pct != null ? "BOND " + pct + "%" : "BOND " + EM, quote: opts.quote, kind: "bond" };
  }

  // Generic Base: GRADUATED/MOVING/LIVE_POOL → LOCKED V4, never age/liq.
  // Empty stats still em-dash. Never fake FACTORY physics.
  if (opts.ageSec == null && opts.liqUsd == null) {
    return { primary: EM, kind: "pair" };
  }
  if (opts.stage === "GRADUATED" || opts.stage === "MOVING" || opts.stage === "LIVE_POOL") {
    return { primary: "LOCKED V4", quote: opts.quote, kind: "locked" };
  }
  const age = opts.ageSec != null ? formatAgeShort(opts.ageSec) : EM;
  const liq = opts.liqUsd != null ? compactUsd(opts.liqUsd) : EM;
  return { primary: age, secondary: liq, kind: "pair" };
}

export function taxEndsIso(launchAtMs: number | undefined, pad: Pad): string | undefined {
  if (launchAtMs == null) return undefined;
  const sec = pad === "O1" ? O1_TAX_SEC : pad === "PONS" ? PONS_TAX_SEC : 0;
  if (!sec) return undefined;
  return new Date(launchAtMs + sec * 1000).toISOString();
}

function formatAgeShort(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  if (s >= 86400) return Math.floor(s / 86400) + "d";
  if (s >= 3600) return Math.floor(s / 3600) + "h";
  if (s >= 60) return Math.floor(s / 60) + "m";
  return s + "s";
}

function compactUsd(n: number): string {
  if (!Number.isFinite(n)) return EM;
  if (n < 1000) return "$" + n.toFixed(0);
  if (n < 1_000_000) return "$" + (n / 1000).toFixed(1) + "k";
  return "$" + (n / 1_000_000).toFixed(2) + "M";
}
