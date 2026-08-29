export const EM = "—";

export function formatUsd(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return EM;
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  if (v < 1000) return sign + "$" + trimNum(v, 2);
  if (v < 1_000_000) return sign + "$" + trimNum(v / 1000, v < 10_000 ? 2 : 1) + "k";
  if (v < 1_000_000_000) return sign + "$" + trimNum(v / 1_000_000, 2) + "M";
  return sign + "$" + trimNum(v / 1_000_000_000, 2) + "B";
}

export function formatAge(ageSec: number | undefined | null): string {
  if (ageSec == null || !Number.isFinite(ageSec)) return EM;
  const s = Math.max(0, Math.floor(ageSec));
  if (s >= 86400) return Math.floor(s / 86400) + "d";
  if (s >= 3600) return Math.floor(s / 3600) + "h";
  if (s >= 60) return Math.floor(s / 60) + "m";
  return s + "s";
}

export function formatPct(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return EM;
  return Math.round(n) + "%";
}

export function shortCa(ca: string): string {
  if (!ca) return EM;
  if (ca.length <= 12) return ca;
  return ca.slice(0, 6) + "..." + ca.slice(-4);
}

function trimNum(n: number, digits: number): string {
  const t = n.toFixed(digits);
  return t.replace(/\.0+$/, "").replace(/(\.[1-9]*)0+$/, "$1");
}
