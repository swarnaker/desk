import fs from "fs";
import path from "path";
import { isProtocol, isQuoteAddr } from "@/lib/line/constants";
import { isEvmCa, rowId } from "@/lib/line/ca";
import { canonicalAddresses, canonicalTicker, isCanonical } from "@/lib/line/canonical";
import { applyDeployerStats } from "@/lib/line/deployer";
import { applyFilters, DEFAULT_FILTERS, isFactoryBeforePair, isPonsMcapExtra, minAgeSec, rowIsStretch, tickerKey } from "@/lib/line/filters";
import { heatScore } from "@/lib/line/heat";
import { computeBirth, computeWake, inferLane, isSurvived } from "@/lib/line/lane";
import { parseAgeGateParam } from "@/lib/line/radarPath";
import { riskFromFlags } from "@/lib/line/risk";
import type { AgeGate, Chain, Filters, HealthSource, RadarBanners, RadarPayload, TokenClone, TokenRow } from "@/lib/line/types";
import { HOUR } from "@/lib/line/types";
import { candToRow, mapDexChain, type Cand } from "./classify";
import { fetchDexSearch, fetchTokensV1, fetchTokensV1Batched, type DexPair } from "./dexscreener";
import { applyHoldersToRow, applyNullHolders, peekHolders } from "./holders";
import { applyMakersToRow, applyNullMakers, peekMakers } from "./makers";
import { harvestO1Factory, harvestPonsFactoryV1, harvestPonsFactoryV2, type FactoryLaunch } from "./factory";
import { fetchGeckoBaseNew } from "./gecko";
import { fetchO1LaunchApi } from "./o1";
import { harvestPonsGraduatedCatalog } from "./pons";

const SNAP = path.join(process.cwd(), "data", "radar-snapshot.json");
// Do NOT Dex-search pons / o1 / robinhood — those queries return pad tokens and leftovers.
const SEARCHES = ["pumpfun", "pumpswap", "cashcat", "basecat"] as const;

function loadSnapshot(): RadarPayload | null {
  try {
    const raw = fs.readFileSync(SNAP, "utf8");
    const parsed = JSON.parse(raw) as RadarPayload;
    if (parsed && Array.isArray(parsed.tokens)) return parsed;
  } catch { /* none */ }
  return null;
}

function persistSnapshot(data: RadarPayload) {
  try {
    fs.mkdirSync(path.dirname(SNAP), { recursive: true });
    const tmp = SNAP + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, SNAP);
  } catch { /* disk */ }
}

function addPair(map: Map<string, Cand>, pair: DexPair, source: string, searchQ?: string) {
  const chain = mapDexChain(pair.chainId);
  if (!chain) return;
  const addr = pair.baseToken?.address;
  if (!addr) return;
  if (chain !== "solana" && !isEvmCa(addr)) return;
  if (isProtocol(addr)) return;
  if (isQuoteAddr(addr, pair.baseToken?.symbol)) return;
  // cashcat/basecat: do not apply pad-chain filters; Dex may return any chain.
  if ((searchQ === "pumpfun" || searchQ === "pumpswap") && chain !== "solana") return;
  const key = rowId(chain, addr);
  const ex = map.get(key);
  if (ex) {
    ex.sources.add(source);
    if (!ex.pair) ex.pair = pair;
    else {
      const a = ex.pair.liquidity?.usd ?? 0;
      const b = pair.liquidity?.usd ?? 0;
      if (b > a) ex.pair = pair;
    }
    if (searchQ && !ex.searchQ) ex.searchQ = searchQ;
    return;
  }
  map.set(key, { chain, ca: addr, sources: new Set([source]), searchQ, pair });
}

function isOfficialPonsSources(sources: Iterable<string>): boolean {
  for (const s of sources) {
    if (s === "pons:catalog" || s.startsWith("pons:factory") || s.startsWith("pons:")) return true;
  }
  return false;
}

function isOfficialO1Sources(sources: Iterable<string>): boolean {
  for (const s of sources) {
    if (s === "o1:api" || s === "o1:factory" || s.startsWith("o1:")) return true;
  }
  return false;
}

function upsertOfficial(
  map: Map<string, Cand>,
  l: FactoryLaunch,
  source: string,
  isFactoryEvent: boolean,
) {
  if (!l.token || isProtocol(l.token) || isQuoteAddr(l.token, l.symbol)) return;
  const key = rowId(l.chain, l.token);
  const ex = map.get(key);
  if (ex) {
    ex.sources.add(source);
    if (isFactoryEvent) ex.sources.add("factory");
    if (!ex.factory) {
      ex.factory = l;
    } else {
      ex.factory = {
        ...l,
        ...ex.factory,
        name: ex.factory.name || l.name,
        symbol: ex.factory.symbol || l.symbol,
        mcapUsd: ex.factory.mcapUsd ?? l.mcapUsd,
        liqUsd: ex.factory.liqUsd ?? l.liqUsd,
        vol1hUsd: ex.factory.vol1hUsd ?? l.vol1hUsd,
        logo: ex.factory.logo || l.logo,
        graduated: ex.factory.graduated || l.graduated,
        timestampMs: ex.factory.timestampMs ?? l.timestampMs,
        deployer: ex.factory.deployer || l.deployer,
        factory: ex.factory.factory || l.factory,
        pad: ex.factory.pad || l.pad,
        txHash: ex.factory.txHash || l.txHash,
        blockNumber: ex.factory.blockNumber || l.blockNumber,
      };
    }
    return;
  }
  const sources = new Set([source]);
  if (isFactoryEvent) sources.add("factory");
  map.set(key, { chain: l.chain, ca: l.token, sources, factory: l });
}

function sameNameCopies(rows: TokenRow[]): void {
  const by = new Map<string, TokenRow[]>();
  for (const r of rows) {
    const k = tickerKey(r.symbol) || r.id;
    const arr = by.get(k) || [];
    arr.push(r);
    by.set(k, arr);
  }
  for (const arr of by.values()) {
    if (arr.length < 2) continue;
    arr.sort((a, b) => b.heat - a.heat);
    arr[0].sameNameCopies = arr.length - 1;
    for (let i = 1; i < arr.length; i++) arr[i].sameNameCopies = arr.length - 1;
  }
}

function cloneMeta(r: TokenRow, keptHighest: boolean): TokenClone {
  return {
    chain: r.chain,
    ca: r.ca,
    symbol: r.symbol,
    mcapUsd: r.mcapUsd,
    canonical: keptHighest,
  };
}

/** Keep ONLY the highest-mcap same-ticker row. Never keep FIRST extras. No hardcoded CA prefer. */
function hideSameTickerCopies(rows: TokenRow[]): { rows: TokenRow[]; hidden: number } {
  const by = new Map<string, TokenRow[]>();
  for (const r of rows) {
    const k = tickerKey(r.symbol) || r.id;
    const arr = by.get(k) || [];
    arr.push(r);
    by.set(k, arr);
  }
  const out: TokenRow[] = [];
  let hidden = 0;
  const mcapOf = (r: TokenRow) => (r.mcapUsd != null ? r.mcapUsd : -1);
  for (const arr of by.values()) {
    if (arr.length === 1) {
      out.push(arr[0]);
      continue;
    }
    const sorted = [...arr].sort((a, b) => mcapOf(b) - mcapOf(a) || (b.liqUsd ?? 0) - (a.liqUsd ?? 0));
    const top = sorted[0];
    const drop = sorted.filter((r) => r.id !== top.id);
    top.sameNameCopies = arr.length - 1;
    top.clones = drop.map((r) => cloneMeta(r, false));
    out.push(top);
    hidden += drop.length;
  }
  return { rows: out, hidden };
}

export type RadarListOpts = { ageGate?: AgeGate; curve?: boolean; watched?: Set<string>; pad?: Filters["pad"]; early?: boolean };

function resolveListOpts(opts?: RadarListOpts): { ageGate: AgeGate; curve: boolean; watched: Set<string>; pad: Filters["pad"]; early: boolean } {
  const ageGate = parseAgeGateParam(opts?.ageGate);
  return { ageGate, curve: opts?.curve === true, watched: opts?.watched ?? new Set(), pad: opts?.pad ?? "ALL", early: opts?.early === true };
}

function countHiddenUnderAge(tokens: TokenRow[], ageGate: AgeGate): number {
  const min = minAgeSec(ageGate);
  if (min <= 0) return 0;
  return tokens.filter((t) => (t.ageSec ?? 0) < min && !rowIsStretch(t)).length;
}

function gateDisplay(tokens: TokenRow[], opts: { ageGate: AgeGate; curve: boolean; watched: Set<string>; pad?: Filters["pad"]; early?: boolean }): TokenRow[] {
  return applyFilters(tokens, { ...DEFAULT_FILTERS, ageGate: opts.ageGate, curve: opts.curve, pad: opts.pad ?? "ALL", early: opts.early === true }, opts.watched);
}

function ponsBooksByMcapCount(
  gated: TokenRow[],
  gates: { ageGate: AgeGate; curve: boolean; watched: Set<string>; pad: Filters["pad"]; early: boolean },
): number {
  if (gates.pad !== "PONS") return 0;
  const f: Filters = { ...DEFAULT_FILTERS, ageGate: gates.ageGate, curve: gates.curve, pad: "PONS", early: gates.early };
  return gated.filter((t) => isPonsMcapExtra(t, f, gates.watched)).length;
}

function withPonsBooksBanner(
  banners: RadarBanners,
  gated: TokenRow[],
  gates: { ageGate: AgeGate; curve: boolean; watched: Set<string>; pad: Filters["pad"]; early: boolean },
): RadarBanners {
  return { ...banners, ponsBooksByMcap: ponsBooksByMcapCount(gated, gates) };
}

function isHollowNonFactory(t: TokenRow): boolean {
  const src = t.sources || [];
  if (src.includes("factory")) return false;
  if (src.some((s) => s.startsWith("pons:") || s.startsWith("o1:"))) return false;
  return t.mcapUsd == null && t.liqUsd == null && t.ageSec == null;
}

function dropCanonical(rows: TokenRow[]): TokenRow[] {
  return rows.filter((t) => !isProtocol(t.ca) && !isQuoteAddr(t.ca, t.symbol));
}

function sumHealth(sources: HealthSource[]): { hits: number; attempts: number } {
  let hits = 0, attempts = 0;
  for (const s of sources) { hits += s.hits; attempts += s.attempts; }
  return { hits, attempts };
}

export async function listRadar(opts?: RadarListOpts): Promise<RadarPayload> {
  const gates = resolveListOpts(opts);
  const prev = loadSnapshot();
  const sources: HealthSource[] = [];
  const map = new Map<string, Cand>();
  const now = Date.now();

  const dexJobs = SEARCHES.map(async (q) => {
    const { items, health } = await fetchDexSearch(q);
    sources.push(health);
    if (health.ok) {
      for (const p of items) addPair(map, p, "dex:" + q, q);
    }
  });
  const cloneHunts: Array<{ q: string; tick: string; asQ: string }> = [
    { q: "cashcat pump", tick: "CASHCAT", asQ: "cashcat" },
    { q: "basecat pump", tick: "BASECAT", asQ: "basecat" },
  ];
  const cloneJobs = cloneHunts.map(async (h) => {
    const { items, health } = await fetchDexSearch(h.q);
    sources.push(health);
    if (!health.ok) return;
    for (const p of items) {
      if (tickerKey(p.baseToken?.symbol) !== h.tick) continue;
      addPair(map, p, "dex:" + h.asQ, h.asQ);
    }
  });
  await Promise.all([...dexJobs, ...cloneJobs]);

  // Dex-include backup for known CAs (CASHCAT/BASECAT examples). Not a runner pin.
  const pinTask = (async () => {
    for (const chain of ["robinhood", "base"] as Chain[]) {
      const addrs = canonicalAddresses(chain);
      if (!addrs.length) continue;
      const { items, health } = await fetchTokensV1(chain, addrs);
      sources.push(health);
      for (const p of items) addPair(map, p, "dex:canonical", undefined);
    }
  })();

  const [ponsCat, ponsV1, ponsV2, o1Base, o1Rh, o1Fac] = await Promise.all([
    harvestPonsGraduatedCatalog(),
    harvestPonsFactoryV1(),
    harvestPonsFactoryV2(),
    fetchO1LaunchApi(8453),
    fetchO1LaunchApi(4663),
    harvestO1Factory(),
    pinTask,
  ]);
  sources.push(ponsCat.health, ponsV1.health, ponsV2.health, o1Base.health, o1Rh.health, o1Fac.health);

  // Catalog first, then factory V1/V2 upgrade same chain:ca. Dex upgrades in place.
  for (const l of ponsCat.launches) upsertOfficial(map, l, "pons:catalog", false);
  for (const l of ponsV1.launches) upsertOfficial(map, l, "pons:factory-v1", true);
  for (const l of ponsV2.launches) upsertOfficial(map, l, "pons:factory-v2", true);
  for (const l of o1Base.launches) upsertOfficial(map, l, "o1:api", false);
  for (const l of o1Rh.launches) upsertOfficial(map, l, "o1:api", false);
  for (const l of o1Fac.launches) upsertOfficial(map, l, "o1:factory", true);

  // Catalog stays in the ingest/snapshot. Do not Dex-hydrate the whole 300+ catalog
  // onto the default board (dust 1h vol would leak every graduate into BOOK).
  const DEX_ADDR_CAP = 60;
  const needDex: Record<"robinhood" | "base", { ca: string; mcap: number; pri: number }[]> = { robinhood: [], base: [] };
  for (const c of map.values()) {
    if (c.chain !== "robinhood" && c.chain !== "base") continue;
    const official = isOfficialPonsSources(c.sources) || isOfficialO1Sources(c.sources) || !!c.factory;
    if (!official) continue;
    const ageSec = c.factory?.timestampMs != null ? (now - c.factory.timestampMs) / 1000 : undefined;
    const young = ageSec != null && ageSec < 6 * HOUR;
    const o1 = isOfficialO1Sources(c.sources);
    const fac = [...c.sources].some((s) => s === "factory" || s.startsWith("pons:factory"));
    needDex[c.chain].push({ ca: c.ca, mcap: c.factory?.mcapUsd ?? 0, pri: (o1 || fac || young) ? 1 : 0 });
  }
  for (const chain of ["robinhood", "base"] as const) {
    const addrs = needDex[chain]
      .sort((a, b) => b.pri - a.pri || b.mcap - a.mcap)
      .slice(0, DEX_ADDR_CAP)
      .map((x) => x.ca);
    if (!addrs.length) continue;
    const { items, health } = await fetchTokensV1Batched(chain, addrs, 30, 4);
    sources.push(health);
    for (const p of items) addPair(map, p, "dex:tokens", undefined);
  }

  const geckoDexNames = new Set(
    [...map.values()].filter((c) => c.pair).map((c) => (c.pair?.baseToken?.name || "").toLowerCase()),
  );
  const gecko = await fetchGeckoBaseNew();
  sources.push(gecko.health);
  if (gecko.health.ok) {
    // Skip names Dex already has. Do not insert gecko-only stubs (no pair).
    for (const g of gecko.items) {
      const key = rowId("base", g.address);
      if (map.has(key)) continue;
      const nm = (g.name || "").toLowerCase();
      if (nm && geckoDexNames.has(nm)) continue;
    }
  }

  let tokens: TokenRow[] = [];
  for (const c of map.values()) {
    const row = candToRow(c, now);
    if (row && !isHollowNonFactory(row)) tokens.push(row);
  }

  let mergedFromSnapshot = 0;
  if (prev?.tokens?.length) {
    const have = new Set(tokens.map((t) => t.id));
    const prevVol = new Map(prev.tokens.map((t) => [t.id, t.vol1hUsd]));
    for (const t of tokens) {
      const pv = prevVol.get(t.id);
      if (pv != null && t.vol1hUsd != null) t.vol1hDeltaUsd = t.vol1hUsd - pv;
    }
    for (const old of prev.tokens) {
      if (have.has(old.id)) continue;
      if (old.pad === "PUMP" || old.chain === "solana") continue;
      if (isProtocol(old.ca) || isQuoteAddr(old.ca, old.symbol)) continue;
      // Drop leftover Dex-search PONS/O1 rows that were never catalog/factory.
      if (old.pad === "PONS" && !isOfficialPonsSources(old.sources || [])) continue;
      if (old.pad === "O1" && !isOfficialO1Sources(old.sources || []) && !isCanonical(old.chain, old.ca)) continue;
      const src = old.sources || [];
      if (src.some((s) => s === "dex:pons" || s === "dex:robinhood" || s === "dex:o1")
        && !isOfficialPonsSources(src) && !isOfficialO1Sources(src) && !isCanonical(old.chain, old.ca)) continue;
      const row = { ...old, sources: Array.from(new Set([...(old.sources || []), "snapshot"])) };
      const fromFactory = (row.sources || []).includes("factory");
      const hollow = row.mcapUsd == null && row.liqUsd == null && row.ageSec == null;
      if (hollow && !fromFactory) continue;
      if (row.stage === "FACTORY" && !fromFactory) {
        row.stage = row.pad === "PONS" || row.pad === "PUMP" ? "ON_CURVE" : (row.pad === "O1" ? "LIVE_POOL" : "GRADUATED");
      }
      tokens.push(row);
      mergedFromSnapshot += 1;
      have.add(old.id);
    }
  }

  tokens = dropCanonical(tokens);
  const prevById = new Map((prev?.tokens || []).map((t) => [t.id, t]));
  for (const t of tokens) {
    t.canonical = isCanonical(t.chain, t.ca);
    const tick = canonicalTicker(t.chain, t.ca);
    if (tick) t.symbol = tick;
    const old = prevById.get(t.id);
    if (t.vol24hUsd == null && old?.vol24hUsd != null) t.vol24hUsd = old.vol24hUsd;
    if (t.stage === "FACTORY" && !(t.sources || []).includes("factory")) {
      t.stage = t.pad === "PONS" || t.pad === "PUMP" ? "ON_CURVE" : (t.pad === "O1" ? "LIVE_POOL" : "GRADUATED");
    }
    t.risk = riskFromFlags(
      (t.risk?.flags || []).filter((f) => f !== "UNCHECKED" && f !== "THIN LP" && f !== "UNK"),
      t.liqUsd,
      t.mcapUsd,
    );
    const cached = peekHolders(t.chain, t.ca);
    if (cached) applyHoldersToRow(t, cached);
    else applyNullHolders(t);
    const mk = peekMakers(t.chain, t.ca);
    if (mk) applyMakersToRow(t, mk);
    else applyNullMakers(t);
  }
  sameNameCopies(tokens);
  for (const t of tokens) {
    t.heat = heatScore({
      ageSec: t.ageSec,
      buyPct: t.buyPct,
      vol1hUsd: t.vol1hUsd,
      mcapUsd: t.mcapUsd,
      liqUsd: t.liqUsd,
      moving: t.moving,
      curveFillPct: t.pad === "O1" ? undefined : t.curveFillPct,
      inTaxWindow: t.stage === "ANTI_SNIPE",
      sameNameCopies: t.sameNameCopies,
      bundlePct: t.bundlePct ?? undefined,
      sniperPct: t.sniperPct ?? undefined,
      riskLevel: t.risk.level,
      pad: t.pad,
    });
  }
  // Count young ingest (including later-hidden copies) before copy drop.
  const hiddenUnderAge = countHiddenUnderAge(tokens, gates.ageGate);
  const minAge = minAgeSec(gates.ageGate);
  const factoryBeforeDex = tokens.filter((t) => {
    if (!isFactoryBeforePair(t)) return false;
    return (t.ageSec ?? 0) >= minAge && isSurvived(t);
  }).length;

  for (const t of tokens) {
    t.lane = inferLane({
      pad: t.pad,
      stage: t.stage,
      ageSec: t.ageSec,
      curveFillPct: t.pad === "O1" ? undefined : t.curveFillPct,
      printing: (t.vol1hUsd ?? 0) > 0 && (t.buyPct ?? 0) >= 50,
      factoryOnly: isFactoryBeforePair(t),
      vol1hUsd: t.vol1hUsd,
      moving: t.moving,
      padSub: t.padSub,
      liqUsd: t.liqUsd,
    });
  }

  const hiddenCopies = hideSameTickerCopies(tokens);
  tokens = hiddenCopies.rows;
  const sameNameCopiesHidden = hiddenCopies.hidden;

  applyDeployerStats(tokens);
  for (const t of tokens) {
    t.birth = computeBirth(t);
    t.wake = computeWake(t);
  }

  const { hits, attempts } = sumHealth(sources);
  const dexOk = sources.some((s) => s.name.startsWith("DexScreener") && s.ok);

  if (!dexOk && !tokens.length && prev?.tokens.length) {
    const staleAgo = prev.lastSuccessAt ? Math.round((now - Date.parse(prev.lastSuccessAt)) / 1000) : null;
    const gated = gateDisplay(prev.tokens, gates);
    return {
      tokens: gated,
      stale: true,
      lastSuccessAt: prev.lastSuccessAt,
      fetchedAt: new Date(now).toISOString(),
      banners: withPonsBooksBanner({ factoryBeforeDex: prev.banners?.factoryBeforeDex ?? 0, mergedFromSnapshot: prev.tokens.length, staleAgoSec: staleAgo, sameNameCopiesHidden: prev.banners?.sameNameCopiesHidden ?? 0, hiddenUnderAge: countHiddenUnderAge(prev.tokens, gates.ageGate) }, gated, gates),
      health: { sources, hits, attempts },
    };
  }

  if (!dexOk && tokens.length === 0 && prev) {
    const staleAgo = prev.lastSuccessAt ? Math.round((now - Date.parse(prev.lastSuccessAt)) / 1000) : null;
    const gated = gateDisplay(prev.tokens, gates);
    return {
      ...prev,
      tokens: gated,
      stale: true,
      fetchedAt: new Date(now).toISOString(),
      banners: withPonsBooksBanner({
        factoryBeforeDex: prev.banners?.factoryBeforeDex ?? 0,
        mergedFromSnapshot: prev.banners?.mergedFromSnapshot ?? 0,
        staleAgoSec: staleAgo,
        sameNameCopiesHidden: prev.banners?.sameNameCopiesHidden ?? 0,
        hiddenUnderAge: countHiddenUnderAge(prev.tokens, gates.ageGate),
      }, gated, gates),
      health: { sources, hits, attempts },
    };
  }

  const lastSuccessAt = dexOk || tokens.length ? new Date(now).toISOString() : prev?.lastSuccessAt ?? null;
  const stale = !dexOk;
  const staleAgoSec = stale && lastSuccessAt ? Math.round((now - Date.parse(lastSuccessAt)) / 1000) : null;
  const payload: RadarPayload = {
    tokens,
    stale,
    lastSuccessAt,
    fetchedAt: new Date(now).toISOString(),
    banners: { factoryBeforeDex, mergedFromSnapshot, staleAgoSec, sameNameCopiesHidden, hiddenUnderAge },
    health: { sources, hits, attempts },
  };
  // Persist FULL ingest (copy-collapsed, ungated). Return UI-gated tokens.
  if (tokens.length) persistSnapshot(payload);
  const gated = gateDisplay(tokens, gates);
  return { ...payload, tokens: gated, banners: withPonsBooksBanner(payload.banners, gated, gates) };
}

export function getSnapshot(): RadarPayload | null {
  return loadSnapshot();
}
