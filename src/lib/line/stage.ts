import { O1_TAX_SEC, PONS_TAX_SEC, type Stage, type StageInput } from "./types";

function taxLeft(launchAtMs: number | undefined, nowMs: number, windowSec: number): number {
  if (launchAtMs == null) return -1;
  return windowSec - (nowMs - launchAtMs) / 1000;
}

/**
 * Pad-specific stage. o1 is never ON_CURVE.
 * FACTORY is ONLY a factory event or a pad launch with no Dex pair yet.
 * Dex-only / Gecko leftovers are LIVE_POOL / GRADUATED / ON_CURVE / MOVING — never FACTORY.
 */
export function inferStage(input: StageInput): Stage {
  const age = input.ageSec ?? (input.launchAtMs != null ? (input.nowMs - input.launchAtMs) / 1000 : undefined);
  const printing = (input.vol1hUsd ?? 0) > 500 && (input.buyPct ?? 0) >= 50;

  if (input.pad === "O1") {
    const left = taxLeft(input.launchAtMs, input.nowMs, O1_TAX_SEC);
    if (left > 0) return "ANTI_SNIPE";
    if (input.factoryOnly && !input.hasDexPair) return "FACTORY";
    if (input.graduated || input.hasDexPair) {
      if (printing && (age ?? 0) >= 20 * 60 && (input.liqUsd ?? 0) >= 8000) return "MOVING";
      return "LIVE_POOL";
    }
    // Gecko leftover or listed without factory event — not FACTORY.
    return "LIVE_POOL";
  }

  if (input.pad === "PONS") {
    const left = taxLeft(input.launchAtMs, input.nowMs, PONS_TAX_SEC);
    if (left > 0 && !input.graduated && !input.ponsHookGraduated && !input.ponsV1Locked) {
      return "ANTI_SNIPE";
    }
    if (input.ponsHookGraduated || input.graduated || input.ponsV1Locked) {
      if (printing && (input.liqUsd ?? 0) >= 3000) return "MOVING";
      return "GRADUATED";
    }
    if (input.factoryOnly || !input.hasDexPair) {
      // Real factory/pad launch with no Dex pair yet.
      if (input.factoryOnly) return "FACTORY";
      // Dex-less gecko leftover on a Pons-classified row is not FACTORY.
      return "ON_CURVE";
    }
    return "ON_CURVE";
  }

  if (input.pad === "PUMP") {
    if (input.graduated) {
      if (printing) return "MOVING";
      return "GRADUATED";
    }
    if (input.factoryOnly) return "FACTORY";
    if (!input.hasDexPair) return "ON_CURVE";
    return "ON_CURVE";
  }

  // Generic Base: LIVE_POOL is o1 / Dex live pool only. Factory-only = FACTORY.
  if (input.factoryOnly && !input.hasDexPair) return "FACTORY";
  if (!input.hasDexPair) return "FACTORY";
  if (printing && (age ?? 0) >= 20 * 60) return "MOVING";
  return "GRADUATED";
}

export function curveFillAllowed(pad: StageInput["pad"]): boolean {
  return pad === "PONS" || pad === "PUMP";
}

export function isOnCurveStage(stage: Stage, pad: StageInput["pad"]): boolean {
  if (pad === "O1") return false;
  return stage === "ON_CURVE";
}
