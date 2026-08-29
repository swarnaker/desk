import type { AgeGate, Pad } from "./types";

export function parseAgeGateParam(raw: string | null | undefined): AgeGate {
  if (raw === "any" || raw === "1h" || raw === "2h" || raw === "6h") return raw;
  return "6h";
}

export function parsePadParam(raw: string | null | undefined): "ALL" | Pad {
  if (raw === "PONS" || raw === "O1" || raw === "PUMP" || raw === "BASE") return raw;
  return "ALL";
}

export function hiddenUnderLabel(gate: AgeGate | undefined): string {
  if (gate === "any") return "any";
  if (gate === "1h") return "1h";
  if (gate === "2h") return "2h";
  return "6h";
}

export function parseEarlyParam(raw: string | null | undefined): boolean {
  return raw === "1";
}

/** Default 6h omits the age query so GET /api/radar matches the UI default. */
export function radarApiPath(ageGate: AgeGate, curve: boolean, watchedIds: string[], pad?: string, early?: boolean): string {
  const p = new URLSearchParams();
  if (curve) p.set("curve", "1");
  if (ageGate === "any" || ageGate === "1h" || ageGate === "2h") p.set("age", ageGate);
  if (watchedIds.length) p.set("watched", watchedIds.join(","));
  if (pad === "PONS" || pad === "O1" || pad === "PUMP" || pad === "BASE") p.set("pad", pad);
  if (early) p.set("early", "1");
  const q = p.toString();
  return q ? "/api/radar?" + q : "/api/radar";
}
