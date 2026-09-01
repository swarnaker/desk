import { ACTIVITY_VOL1H_USD, BOOSTED_HIDE_UNIQUE_BUYERS, FIRST_WINDOW_SEC, HOUR, PONS_MCAP_BOOK_USD, type AgeGate, type Filters, type TokenRow } from "./types";
import { isOnCurve, isStretchException, isSurvived } from "./lane";
import { isHiddenRisky } from "./risk";

/** trim + upper + strip quotes/spaces. Same-ticker copies group on this, not raw symbol. */
export function tickerKey(symbol?: string): string {
  return (symbol || "").trim().toUpperCase().replace(/['\s]/g, "");
}

export const DEFAULT_FILTERS: Filters = {
  pad: "BOTH",
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
  early: false,
  hideRisky: false,
  stocks: false,
};

/** PUMP/PONS/O1/BASE/LONG/VIRTUALS/CLANKER exact. BOTH, ALL, or omitted = PONS or O1 only (not PUMP, not BASE, not LONG, not VIRTUALS, not CLANKER). */
export function padMatches(row: { pad: string }, pad?: Filters["pad"]): boolean {
  if (pad === "PUMP" || pad === "PONS" || pad === "O1" || pad === "BASE" || pad === "LONG" || pad === "VIRTUALS" || pad === "CLANKER") return row.pad === pad;
  return row.pad === "PONS" || row.pad === "O1";
}

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

/** Quiet graduated/LIVE Pons or O1 book, mcap >= $30k. Own 1h age floor — not the 6h default gate. */
export function isPonsMcapBook(row: TokenRow, f: Filters, watchSet: Set<string> = new Set()): boolean {
  void f;
  if (row.pad !== "PONS" && row.pad !== "O1") return false;
  if (!isSurvived(row)) return false;
  if (isOnCurve(row)) return false;
  if ((row.mcapUsd ?? 0) < PONS_MCAP_BOOK_USD) return false;
  if (watched(row, watchSet)) return true;
  // Missing age only if survived locked major (BOOK) — same as passesAgeGate.
  if (row.ageSec == null) return row.lane === "BOOK" && isSurvived(row);
  if (row.ageSec < HOUR) return false;
  return true;
}

/** PONS/BOTH/ALL extra: $30k book that would be hidden by activity or BOOK 0-vol. */
export function isPonsMcapExtra(row: TokenRow, f: Filters, watchSet: Set<string> = new Set()): boolean {
  if (f.pad !== "PONS" && f.pad !== "BOTH" && f.pad !== "ALL") return false;
  if (!isPonsMcapBook(row, f, watchSet)) return false;
  if (!passesActivityGate(row, watchSet)) return true;
  if (row.lane === "BOOK" && !((row.vol1hUsd ?? 0) > 0) && !watched(row, watchSet)) return true;
  return false;
}

/** Exclusive EARLY chip: graduated Pons aged 1h–12h with 20+ buyers or $5k/h. */
export function isEarlyPons(row: TokenRow): boolean {
  if (row.pad !== "PONS") return false;
  if (row.stage !== "GRADUATED") return false;
  if (row.ageSec == null || !Number.isFinite(row.ageSec)) return false;
  if (row.ageSec < HOUR || row.ageSec > 12 * HOUR) return false;
  const buyersOk = row.uniqueBuyers1h != null && row.uniqueBuyers1h >= 20;
  const volOk = (row.vol1hUsd ?? 0) >= 5000;
  return buyersOk || volOk;
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
 * HIGH-HEAT EXCEPTION: heat >= 320 AND risk not RED AND not ON_CURVE AND (uniqueBuyers1h >= 10 OR vol1hUsd >= 2000)
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
  // HIGH-HEAT EXCEPTION: bypass age gate for hot rows with activity
  if (
    row.heat >= 320 &&
    row.risk.level !== "RED" &&
    !isOnCurve(row) &&
    ((row.uniqueBuyers1h != null && row.uniqueBuyers1h >= 10) || (row.vol1hUsd != null && row.vol1hUsd >= 2000))
  ) {
    return true;
  }
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
  if (f.early) {
    if (!isEarlyPons(row)) return false;
  } else if (!passesAgeGate(row, f, watchSet) && !isPonsMcapBook(row, f, watchSet)) {
    return false;
  }
  if (!passesBondingGate(row, f)) return false;
  // EARLY already required buyers>=20 or $5k/h. Do not also demand the $5k All-board gate.
  // $30k+ survived Pons/O1 books bypass activity on Both (and Pons/O1 chips).
  if (!f.early && !passesActivityGate(row, watchSet) && !isPonsMcapBook(row, f, watchSet)) return false;
  if (isBoostedHidden(row) && !watched(row, watchSet)) return false;
  // BOOK: hide 0 / missing 1h vol unless watched. NEW/STRETCH unchanged.
  // Quiet $30k+ Pons/O1 books stay on Both (isPonsMcapBook).
  if (!f.early && row.lane === "BOOK" && !((row.vol1hUsd ?? 0) > 0) && !watched(row, watchSet) && !isPonsMcapBook(row, f, watchSet)) return false;
  if (!padMatches(row, f.pad)) return false;
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
  if (!f.early && (f.birthOnly || f.wakeOnly)) {
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
