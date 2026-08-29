import { SERIAL_LAUNCHES_7D, SERIAL_MCAP_USD, WEEK_SEC, type Pad, type TokenRow } from "./types";

/** Reject zero / empty / placeholder deployer. Never treat missing as a count. */
export function isRealDeployer(addr?: string | null): addr is string {
  if (!addr) return false;
  const s = addr.trim();
  if (s.length < 20) return false;
  if (/^0x0+$/i.test(s)) return false;
  if (/^1+$/.test(s)) return false;
  return true;
}

function officialLaunchSources(sources?: string[]): boolean {
  for (const s of sources || []) {
    if (s === "factory" || s.startsWith("pons:") || s.startsWith("o1:")) return true;
  }
  return false;
}

function ageSecOf(row: { ageSec?: number; firstSeenAt?: string }, now: number): number | null {
  if (row.ageSec != null && Number.isFinite(row.ageSec)) return row.ageSec;
  if (row.firstSeenAt) {
    const t = Date.parse(row.firstSeenAt);
    if (Number.isFinite(t)) return Math.max(0, (now - t) / 1000);
  }
  return null;
}

export type DeployerAgg = { count: number; lowMcap: number };

/**
 * Count launches on THIS pad in the last 7d from official catalog/factory/o1 rows.
 * If the pad has no official deployer records, return empty — callers leave count as null (dash).
 */
export function deployerStats7d(
  rows: Array<{
    pad: Pad;
    deployer?: string;
    sources?: string[];
    ageSec?: number;
    firstSeenAt?: string;
    mcapUsd?: number;
  }>,
  now = Date.now(),
): { byKey: Map<string, DeployerAgg>; padsWithOfficial: Set<Pad> } {
  const byKey = new Map<string, DeployerAgg>();
  const padsWithOfficial = new Set<Pad>();
  for (const r of rows) {
    if (!isRealDeployer(r.deployer)) continue;
    if (!officialLaunchSources(r.sources)) continue;
    padsWithOfficial.add(r.pad);
    const age = ageSecOf(r, now);
    if (age == null || age > WEEK_SEC) continue;
    const k = r.pad + ":" + r.deployer.trim().toLowerCase();
    const a = byKey.get(k) || { count: 0, lowMcap: 0 };
    a.count += 1;
    if (r.mcapUsd != null && Number.isFinite(r.mcapUsd) && r.mcapUsd < SERIAL_MCAP_USD) a.lowMcap += 1;
    byKey.set(k, a);
  }
  return { byKey, padsWithOfficial };
}

export function deployerKey(pad: Pad, deployer: string): string {
  return pad + ":" + deployer.trim().toLowerCase();
}

/** Attach 7d count + AMBER SERIAL. Missing official records → dash (null) and no flag. */
export function applyDeployerStats(rows: TokenRow[], now = Date.now()): TokenRow[] {
  const { byKey, padsWithOfficial } = deployerStats7d(rows, now);
  for (const t of rows) {
    if (!isRealDeployer(t.deployer) || !padsWithOfficial.has(t.pad)) {
      t.deployerLaunchCount7d = null;
      t.serialAmber = false;
      continue;
    }
    const a = byKey.get(deployerKey(t.pad, t.deployer));
    t.deployerLaunchCount7d = a ? a.count : 0;
    t.serialAmber = !!(a && a.lowMcap >= SERIAL_LAUNCHES_7D);
    if (t.serialAmber) {
      const flags = (t.risk?.flags || []).filter((f) => f !== "AMBER SERIAL");
      flags.push("AMBER SERIAL");
      const level = t.risk?.level === "RED" ? "RED" : "AMBER";
      t.risk = { level, flags };
    }
  }
  return rows;
}

export function deskOrganicBadge(boostsActive?: number | null): "ORGANIC" | "BOOSTED" | null {
  if (boostsActive == null) return null;
  return boostsActive > 0 ? "BOOSTED" : "ORGANIC";
}
