import { ACTIVITY_VOL1H_USD, BOOSTED_HIDE_UNIQUE_BUYERS, FIRST_WINDOW_SEC, HOUR, PONS_MCAP_BOOK_USD, type AgeGate, type Filters, type TokenRow } from "./types";
import { isOnCurve, isStretchException, isSurvived } from "./lane";
import { isHiddenRisky } from "./risk";

/** trim + upper + strip quotes/spaces. Same-ticker copies group on this, not raw symbol. */
export function tickerKey(symbol?: string): string {
  return (symbol || "").trim().toUpperCase().replace(/['\s]/g, "");
}

export const DEFAULT_FILTERS: Filters = {
  pad: "ALL",
  mood: "ALL",
  liqMin: 0,
  mcapMin: 0,
  ageMax: "any",
  ageGate: "6h",
  curve: false,
  bucket: "any",
  o1Gate: false,
  desk: false,
  watchOnly: false,
  firstOnly: false,
  birthOnly: false,
  wakeOnly: false,
  hideRisky: false,
  stocks: false,
};

export function minAgeSec(gate: AgeGate | undefined): number {
  if (gate === "1h") return HOUR;
  if (gate === "2h") return 2 * HOUR;
  if (gate === "any") return 0;
  return 6 * HOUR;
}

export function tx1h(row: TokenRow): number {
  return (row.buys ?? 0) + (row.sells ?? 0);
}

/** Hide unless vol1hUsd >= 5k OR watched. tx>=20 alone is not enough. */
export function passesActivityGate(row: TokenRow, watchSet: Set<string> = new Set()): boolean {
  if (watched(row, watchSet)) return true;
  return (row.vol1hUsd ?? 0) >= ACTIVITY_VOL1H_USD;
}

function watched(row: TokenRow, watchSet: Set<string>): boolean {
  const ca = row.ca.toLowerCase();
  return watchSet.has(ca) || watchSet.has(row.id.toLowerCase());
}

/** Graduated Pons $1M+ book that already passed age + bonding. No activity required. */
export function isPonsMcapBook(row: TokenRow, f: Filters, watchSet: Set<string> = new Set()): boolean {
  if (row.pad !== "PONS") return false;
  if (!isSurvived(row)) return false;
  if (isOnCurve(row)) return false;
  if ((row.mcapUsd ?? 0) < PONS_MCAP_BOOK_USD) return false;
  return passesAgeGate(row, f, watchSet);
}

/** Pons-chip extra: $1M book that would be hidden by activity or BOOK 0-vol. */
export function isPonsMcapExtra(row: TokenRow, f: Filters, watchSet: Set<string> = new Set()): boolean {
  if (f.pad !== "PONS") return false;
  if (!isPonsMcapBook(row, f, watchSet)) return false;
  if (!passesActivityGate(row, watchSet)) return true;
  if (row.lane === "BOOK" && !((row.vol1hUsd ?? 0) > 0) && !watched(row, watchSet)) return true;
  return false;
}

/** Factory-seen-before-pair: factory source and no Dex pair yet. FIRST includes these. */
export function isFactoryBeforePair(row: TokenRow): boolean {
  const src = row.sources || [];
  return src.includes("factory") && !src.some((s) => s.startsWith("dex"));
}

export function rowIsStretch(row: TokenRow): boolean {
  return isStretchException({
    pad: row.pad,
    stage: row.stage,
    curveFillPct: row.pad === "O1" ? undefined : row.curveFillPct,
  });
}

/**
 * Hidden unless ageSec >= minAge, OR (Curve chip on AND Pons/Pump stretch fill >= 0.70),
 * OR watched / markFirst (client watch set). Stretch does NOT punch the default board.
 */
export function passesAgeGate(
  row: TokenRow,
  f: Filters,
  watchSet: Set<string> = new Set(),
): boolean {
  if (watched(row, watchSet)) return true;
  if (f.curve && rowIsStretch(row)) return true;
  if (f.ageGate === "any") return true;
  // Missing age only if survived locked major (BOOK).
  if (row.ageSec == null) return row.lane === "BOOK" && isSurvived(row);
  return row.ageSec >= minAgeSec(f.ageGate);
}

/**
 * Bonding gate. Default curve=false: hide all ON_CURVE; show only survived.
 * Watched/FIRST do not bypass this. ON_CURVE only when Curve chip is on.
 */
export function passesBondingGate(row: TokenRow, f: Filters): boolean {
  if (isOnCurve(row)) return f.curve === true;
  return isSurvived(row);
}

export function applyFilters(
  rows: TokenRow[],
  f: Filters,
  watchSet: Set<string> = new Set(),
): TokenRow[] {
  // Age gate, then bonding gate, then activity gate, then other filters, then copies.
  // Server already collapsed copies; client may still keep watched extras.
  return dropUnwatchedCopies(rows.filter((row) => matchRow(row, f, watchSet)), watchSet);
}

/** BOOSTED-only hide: known boosts > 0 AND known uniqueBuyers1h < 10. Unknown boosts: do not hide. */
export function isBoostedHidden(row: TokenRow): boolean {
  if (row.boostsActive == null) return false;
  if (row.boostsActive <= 0) return false;
  if (row.uniqueBuyers1h == null) return false;
  return row.uniqueBuyers1h < BOOSTED_HIDE_UNIQUE_BUYERS;
}

function matchRow(row: TokenRow, f: Filters, watchSet: Set<string>): boolean {
  if (!passesAgeGate(row, f, watchSet)) return false;
  if (!passesBondingGate(row, f)) return false;
  if (!passesActivityGate(row, watchSet) && !(f.pad === "PONS" && isPonsMcapBook(row, f, watchSet))) return false;
  if (isBoostedHidden(row) && !watched(row, watchSet)) return false;
  // BOOK: hide 0 / missing 1h vol unless watched. NEW/STRETCH unchanged.
  // Pons chip: keep quiet $1M+ graduated books (isPonsMcapBook).
  if (row.lane === "BOOK" && !((row.vol1hUsd ?? 0) > 0) && !watched(row, watchSet) && !(f.pad === "PONS" && isPonsMcapBook(row, f, watchSet))) return false;
  if (f.pad !== "ALL" && row.pad !== f.pad) return false;
  if (f.liqMin && (row.liqUsd ?? 0) < f.liqMin) return false;
  if (f.mcapMin && (row.mcapUsd ?? 0) < f.mcapMin) return false;
  const age = row.ageSec ?? 0;
  if (f.ageMax === "3h" && age > 3 * HOUR) return false;
  if (f.ageMax === "12h" && age > 12 * HOUR) return false;
  if (f.bucket === "1-6h" && (age < HOUR || age > 6 * HOUR)) return false;
  if (f.bucket === "older" && age <= 6 * HOUR) return false;
  if (f.o1Gate && row.pad !== "O1") return false;
  if (f.stocks && row.quote !== "STOCK" && row.quote !== "USDG") return false;
  if (f.hideRisky && isHiddenRisky(row)) return false;
  if (f.watchOnly && !watched(row, watchSet)) return false;
  if (f.firstOnly && age > FIRST_WINDOW_SEC && !isFactoryBeforePair(row)) return false;
  if (f.birthOnly || f.wakeOnly) {
    const birthOk = f.birthOnly && !!row.birth;
    const wakeOk = f.wakeOnly && !!row.wake;
    if (!birthOk && !wakeOk) return false;
  }
  if (f.desk) {
    const first = age <= FIRST_WINDOW_SEC || isFactoryBeforePair(row);
    if (!(watched(row, watchSet) || first || row.moving)) return false;
  }
  if (!moodOk(row, f.mood)) return false;
  return true;
}

function dropUnwatchedCopies(rows: TokenRow[], watchSet: Set<string>): TokenRow[] {
  const by = new Map<string, TokenRow[]>();
  for (const r of rows) {
    const k = tickerKey(r.symbol) || r.id;
    const arr = by.get(k) || [];
    arr.push(r);
    by.set(k, arr);
  }
  const keep = new Set<string>();
  const mcapOf = (r: TokenRow) => (r.mcapUsd != null ? r.mcapUsd : -1);
  for (const arr of by.values()) {
    if (arr.length === 1) { keep.add(arr[0].id); continue; }
    const sorted = [...arr].sort((a, b) => mcapOf(b) - mcapOf(a));
    keep.add(sorted[0].id);
    for (const r of arr) {
      if (watched(r, watchSet)) keep.add(r.id);
    }
  }
  return rows.filter((r) => keep.has(r.id));
}


function moodOk(row: TokenRow, mood: Filters["mood"]): boolean {
  if (mood === "ALL") return true;
  const buy = row.buyPct;
  const age = row.ageSec ?? 99999;
  if (mood === "BUY") return buy != null && buy >= 55;
  if (mood === "SELL") return buy != null && buy < 45;
  if (mood === "WHALES") return (row.vol1hUsd ?? 0) >= 10000 || (row.liqUsd ?? 0) >= 50000;
  if (mood === "SNIPES") return age < 120 || row.stage === "FACTORY" || row.stage === "ANTI_SNIPE";
  return true;
}
