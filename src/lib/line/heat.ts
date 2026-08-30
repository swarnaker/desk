import type { HeatInput } from "./types";

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Heat 0-400. Freshness decays after 6h. curveFill only Pons/Pump. */
export function heatScore(input: HeatInput): number {
  const age = Math.max(0, input.ageSec ?? 6 * 3600);
  const freshness = clamp(1 - age / (6 * 3600), 0, 1);
  const buy = input.buyPct ?? 50;
  const buyBoost = buy > 55 ? clamp((buy - 50) / 50, 0, 1) : buy / 200;
  const vol = Math.max(0, input.vol1hUsd ?? 0);
  const mcap = Math.max(0, input.mcapUsd ?? 0);
  const liq = Math.max(0, input.liqUsd ?? 0);
  const volN = clamp(Math.log10(1 + vol) / 5, 0, 1);
  let accel = 0;
  if (mcap > 0 && vol > 0) accel = clamp(vol / mcap, 0, 1);
  const moving = input.moving ? 0.18 : 0;
  let curve = 0;
  if ((input.pad === "PONS" || input.pad === "PUMP") && input.curveFillPct != null) {
    curve = clamp(input.curveFillPct, 0, 1) * 0.16;
  }
  const tax = input.inTaxWindow ? 0.06 : 0;

  let raw =
    400 *
    (0.28 * freshness + 0.22 * buyBoost + 0.18 * volN + 0.1 * accel + moving + curve + tax);

  if (liq > 0 && liq < 1500) raw -= 40;
  const copies = input.sameNameCopies ?? 0;
  if (copies > 0) raw -= Math.min(60, copies * 18);
  if (input.bundlePct != null && input.bundlePct > 40) raw -= 30;
  if (input.sniperPct != null && input.sniperPct > 40) raw -= 30;

  // Clamp to 0-400 max (never exceed 400)
  let heat = Math.round(clamp(raw, 0, 400));
  if (input.riskLevel === "RED") heat = Math.min(heat, 180);
  // Final clamp ensures heat never exceeds 400
  return Math.min(heat, 400);
}

export function isMoving(vol1hUsd?: number, buyPct?: number, liqUsd?: number, ageSec?: number): boolean {
  return (vol1hUsd ?? 0) >= 2000 && (liqUsd ?? 0) >= 3000 && (ageSec ?? 0) >= 60 && (buyPct ?? 0) >= 45;
}
