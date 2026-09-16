import fs from "fs";
import path from "path";
import { isEvmCa } from "@/lib/line/ca";
import { isProtocol, isQuoteAddr, O1_LAUNCH_API } from "@/lib/line/constants";
import type { HealthSource } from "@/lib/line/types";
import type { FactoryLaunch } from "./factory";
import { fail } from "./http";
import { fetchTokensV1Batched, numOrNull, type DexPair } from "./dexscreener";

const CACHE_MS = 60_000;
const LAST_DIR = path.join(process.cwd(), "data");

const ARCPAD_API = "https://arcpad.meme/api/tokens";
const ARGUS_API = "https://argus.world/api/tokens";
const ARC_CHAIN_ID = 5042;

// Arc factories
const O1_ARC_FACTORY = "0xeE3E862Efde6DCd6DF5648AF0E2731B9D1dF4605";
const ARCPAD_FACTORY = "0x24196cd6e534cfce8f480b53e70809b68ea86f29";

// Seeded ARC tokens (explicit pins - always visible)
const SEEDED_ARC_TOKENS: Array<{ ca: string; symbol: string; name: string }> = [
  { ca: "0xeCe5cA8bf9220718E5727754026757512212cb3c", symbol: "ARGUS", name: "ARGUS" },
  { ca: "0xbc43ce8dec648ea298c4275559b81d6261c90b67", symbol: "TOLLY", name: "TOLLY" },
  { ca: "0xeb64987643db71c76b2a2be7e723decc995e5b37", symbol: "COOL", name: "COOL" },
  { ca: "0x07704b06981ea962b87296362a1281484d160000", symbol: "ARCAT", name: "ARCAT" },
  { ca: "0x2164bb17a2d38c1b5170e987b2c0416df1efc752", symbol: "LONG", name: "LONG" },
];

// Set of seeded CAs (lowercase) for quality gate bypass
export const SEEDED_ARC_CAS = new Set(
  SEEDED_ARC_TOKENS.map(t => t.ca.toLowerCase())
);

function num(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function usdOf(obj: unknown): number | undefined {
  const rec = asRecord(obj);
  if (!rec) return num(obj);
  return num(rec.usd);
}

function mapArcPadItem(row: unknown, topLevelChainId?: number): FactoryLaunch | null {
  const r = asRecord(row);
  if (!r) return null;
  
  // Accept chainId from item or top-level parameter
  const chainId = num(r.chainId) ?? topLevelChainId;
  if (chainId !== ARC_CHAIN_ID) return null;

  // ArcPad API uses 'token' field for CA
  const token = typeof r.token === "string" ? r.token : "";
  if (!isEvmCa(token) || isProtocol(token)) return null;
  
  const symbol = typeof r.symbol === "string" ? r.symbol : undefined;
  if (isQuoteAddr(token, symbol)) return null;
  
  const name = typeof r.name === "string" ? r.name : undefined;
  const logo = typeof r.imageURI === "string" ? r.imageURI : undefined;
  
  const timestampSec = num(r.timestamp);
  const timestampMs = timestampSec ? timestampSec * 1000 : null;
  const mcap = num(r.marketCapUsd);
  const vol24 = num(r.volume24Usd);
  
  const deployer = typeof r.creator === "string" ? r.creator : "0x0000000000000000000000000000000000000000";
  
  return {
    token,
    deployer,
    factory: ARCPAD_FACTORY,
    blockNumber: 0,
    txHash: "",
    timestampMs,
    name,
    symbol,
    chain: "arc",
    pad: "ARC",
    mcapUsd: mcap,
    liqUsd: undefined,
    vol1hUsd: vol24,
    logo,
    graduated: false,
  };
}

function mapArgusItem(row: unknown, topLevelChainId?: number): FactoryLaunch | null {
  const r = asRecord(row);
  if (!r) return null;
  
  // Accept chainId from item or top-level parameter
  const chainId = num(r.chainId) ?? topLevelChainId;
  if (chainId !== ARC_CHAIN_ID) return null;

  // Argus should have address field
  const token = typeof r.address === "string" ? r.address : (typeof r.token === "string" ? r.token : "");
  if (!isEvmCa(token) || isProtocol(token)) return null;
  
  const symbol = typeof r.symbol === "string" ? r.symbol : undefined;
  if (isQuoteAddr(token, symbol)) return null;
  
  const name = typeof r.name === "string" ? r.name : undefined;
  const logo = typeof r.logoUrl === "string" ? r.logoUrl : (typeof r.imageURI === "string" ? r.imageURI : undefined);
  
  const createdAt = typeof r.createdAt === "string" ? Date.parse(r.createdAt) : null;
  const mcap = num(r.marketCap) ?? num(r.marketCapUsd);
  const vol24 = num(r.volume24h) ?? num(r.volume24Usd);
  
  const deployer = typeof r.creator === "string" ? r.creator : "0x0000000000000000000000000000000000000000";
  
  return {
    token,
    deployer,
    factory: ARCPAD_FACTORY,
    blockNumber: 0,
    txHash: "",
    timestampMs: createdAt,
    name,
    symbol,
    chain: "arc",
    pad: "ARC",
    mcapUsd: mcap,
    liqUsd: undefined,
    vol1hUsd: vol24,
    logo,
    graduated: false,
  };
}

function mapO1ArcItem(row: unknown): FactoryLaunch | null {
  const r = asRecord(row);
  if (!r) return null;
  const tokenObj = asRecord(r.token) || r;
  const addrRaw = tokenObj.address || tokenObj.token || r.address || r.token_address;
  const token = typeof addrRaw === "string" ? addrRaw : "";
  if (!isEvmCa(token) || isProtocol(token)) return null;
  const symbol = typeof tokenObj.symbol === "string" ? tokenObj.symbol : (typeof r.symbol === "string" ? r.symbol : undefined);
  if (isQuoteAddr(token, symbol)) return null;
  const name = typeof tokenObj.name === "string" ? tokenObj.name : (typeof r.name === "string" ? r.name : undefined);
  const logo = typeof tokenObj.image_url === "string" ? tokenObj.image_url : (typeof r.image_url === "string" ? r.image_url : undefined);
  const launch = asRecord(r.launch) || {};
  const createdRaw = launch.created_at || r.created_at || r.launchAt || r.launched_at;
  const created = typeof createdRaw === "string" ? Date.parse(createdRaw) : NaN;
  const onchain = asRecord(launch.onchain) || {};
  const md = asRecord(r.market_data);
  const mcap = usdOf(md?.market_cap);
  const liq = usdOf(md?.liquidity);
  const activity = asRecord(md?.activity);
  const win1h = asRecord(activity ? activity["1h"] : undefined);
  const vol1h = usdOf(win1h?.volume_usd) ?? num(win1h?.volume_usd);
  const deployer = typeof launch.creator_address === "string" ? launch.creator_address : "0x0000000000000000000000000000000000000000";
  const tx = typeof onchain.transaction_hash === "string" ? onchain.transaction_hash : "";
  const block = typeof onchain.block_number === "number" ? onchain.block_number : 0;
  return {
    token,
    deployer,
    factory: O1_ARC_FACTORY,
    blockNumber: block,
    txHash: tx,
    timestampMs: Number.isFinite(created) ? created : null,
    name,
    symbol,
    chain: "arc",
    pad: "ARC",
    mcapUsd: mcap,
    liqUsd: liq,
    vol1hUsd: vol1h,
    logo,
    graduated: false,
  };
}

type ArcPack = { launches: FactoryLaunch[]; health: HealthSource; at: number };

let memCache: ArcPack | null = null;
const lastGood: FactoryLaunch[] = [];
let inflight: Promise<{ launches: FactoryLaunch[]; health: HealthSource }> | null = null;

function lastPath(): string {
  return path.join(LAST_DIR, "arc-last.json");
}

function readLastGood(): FactoryLaunch[] {
  if (lastGood.length) return lastGood;
  try {
    const parsed = JSON.parse(fs.readFileSync(lastPath(), "utf8")) as unknown;
    if (Array.isArray(parsed) && parsed.length) {
      lastGood.push(...(parsed as FactoryLaunch[]));
      return lastGood;
    }
  } catch { /* none */ }
  return [];
}

function writeLastGood(launches: FactoryLaunch[]) {
  lastGood.length = 0;
  lastGood.push(...launches);
  try {
    fs.mkdirSync(LAST_DIR, { recursive: true });
    const tmp = lastPath() + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(launches));
    fs.renameSync(tmp, lastPath());
  } catch { /* disk */ }
}

async function fetchArcPadApi(): Promise<FactoryLaunch[]> {
  const res = await fetch(ARCPAD_API, {
    headers: {
      accept: "application/json",
      "user-agent": "line-radar/1.0",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  
  if (!res.ok) throw new Error("HTTP " + res.status);
  
  const json = (await res.json()) as unknown;
  const rec = asRecord(json);
  
  // Get top-level chainId
  const topLevelChainId = num(rec?.chainId);
  
  // Parse creations[], NOT tokens[]
  const arr: unknown[] = Array.isArray(rec?.creations) ? rec.creations as unknown[] : [];
  
  const out: FactoryLaunch[] = [];
  for (const item of arr) {
    const mapped = mapArcPadItem(item, topLevelChainId);
    if (mapped) out.push(mapped);
  }
  return out;
}

async function fetchArgusApi(): Promise<FactoryLaunch[]> {
  const res = await fetch(ARGUS_API, {
    headers: {
      accept: "application/json",
      "user-agent": "line-radar/1.0",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
    redirect: "follow",
  });
  
  if (!res.ok) throw new Error("HTTP " + res.status);
  
  const json = (await res.json()) as unknown;
  const rec = asRecord(json);
  
  // Get top-level chainId
  const topLevelChainId = num(rec?.chainId);
  
  // Try different array fields
  const arr: unknown[] = Array.isArray(json)
    ? json
    : Array.isArray(rec?.tokens)
      ? rec!.tokens as unknown[]
      : Array.isArray(rec?.creations)
        ? rec!.creations as unknown[]
        : [];
  
  const out: FactoryLaunch[] = [];
  for (const item of arr) {
    const mapped = mapArgusItem(item, topLevelChainId);
    if (mapped) out.push(mapped);
  }
  return out;
}

async function fetchO1ArcApi(key: string): Promise<FactoryLaunch[]> {
  const limit = 200;
  const url = O1_LAUNCH_API + "?chain_id=" + ARC_CHAIN_ID + "&market=all&sort=trending&limit=" + limit;
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "line-radar/1.0",
      "x-api-key": key,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) throw new Error("HTTP " + res.status);
  const json = (await res.json()) as unknown;
  const rec = asRecord(json);
  const arr: unknown[] = Array.isArray(json)
    ? json
    : Array.isArray(rec?.data)
      ? rec!.data as unknown[]
      : Array.isArray(rec?.tokens)
        ? rec!.tokens as unknown[]
        : [];
  const out: FactoryLaunch[] = [];
  for (const item of arr) {
    const mapped = mapO1ArcItem(item);
    if (mapped) out.push(mapped);
  }
  return out;
}

function createSeededArcTokens(): FactoryLaunch[] {
  return SEEDED_ARC_TOKENS.map(seed => ({
    token: seed.ca,
    deployer: "0x0000000000000000000000000000000000000000",
    factory: ARCPAD_FACTORY,
    blockNumber: 0,
    txHash: "",
    timestampMs: null,
    name: seed.name,
    symbol: seed.symbol,
    chain: "arc" as const,
    pad: "ARC" as const,
    mcapUsd: undefined,
    liqUsd: undefined,
    vol1hUsd: undefined,
    logo: undefined,
    graduated: true,
  }));
}

async function enrichArcLaunchesWithDex(launches: FactoryLaunch[]): Promise<FactoryLaunch[]> {
  if (!launches.length) return launches;
  
  // Fetch DexScreener data for chainId 5042 (Arc)
  const addresses = launches.map(l => l.token);
  const { items } = await fetchTokensV1Batched("5042", addresses, 30, 4);
  
  // Build map of CA -> best pair (highest liquidity)
  const pairMap = new Map<string, DexPair>();
  for (const pair of items) {
    const ca = pair.baseToken?.address?.toLowerCase();
    if (!ca) continue;
    
    const existing = pairMap.get(ca);
    const newLiq = numOrNull(pair.liquidity?.usd) ?? 0;
    const existingLiq = existing ? (numOrNull(existing.liquidity?.usd) ?? 0) : 0;
    
    if (!existing || newLiq > existingLiq) {
      pairMap.set(ca, pair);
    }
  }
  
  // Enrich launches with Dex data
  return launches.map(launch => {
    const pair = pairMap.get(launch.token.toLowerCase());
    if (!pair) return launch;
    
    const mcap = numOrNull(pair.marketCap) ?? numOrNull(pair.fdv);
    const liq = numOrNull(pair.liquidity?.usd);
    const vol1h = numOrNull(pair.volume?.h1);
    const logo = pair.info?.imageUrl;
    const name = pair.baseToken?.name || launch.name;
    const symbol = pair.baseToken?.symbol || launch.symbol;
    
    return {
      ...launch,
      mcapUsd: mcap ?? launch.mcapUsd,
      liqUsd: liq ?? launch.liqUsd,
      vol1hUsd: vol1h ?? launch.vol1hUsd,
      logo: logo || launch.logo,
      name: name || launch.name,
      symbol: symbol || launch.symbol,
    };
  });
}

export async function harvestArc(): Promise<{ launches: FactoryLaunch[]; health: HealthSource }> {
  const name = "arc";
  
  if (memCache && Date.now() - memCache.at < CACHE_MS) {
    return { launches: memCache.launches, health: memCache.health };
  }
  
  if (inflight) return inflight;
  
  const run = (async () => {
    const t0 = Date.now();
    try {
      // Create seeded tokens first
      const seededLaunches = createSeededArcTokens();
      
      // Fetch Argus first, then ArcPad, then o1 Arc
      const results = await Promise.allSettled([
        fetchArgusApi(),
        fetchArcPadApi(),
        (async () => {
          const key = process.env.O1_API_KEY;
          return key ? await fetchO1ArcApi(key) : [];
        })(),
      ]);
      
      const argusLaunches = results[0].status === "fulfilled" ? results[0].value : [];
      const arcpadLaunches = results[1].status === "fulfilled" ? results[1].value : [];
      const o1ArcLaunches = results[2].status === "fulfilled" ? results[2].value : [];
      
      // Merge seeded tokens with API results, deduping by CA
      const seenCAs = new Set<string>();
      const mergedLaunches: FactoryLaunch[] = [];
      
      // First add API results (they have priority for enrichment)
      for (const launch of [...argusLaunches, ...arcpadLaunches, ...o1ArcLaunches]) {
        const ca = launch.token.toLowerCase();
        if (!seenCAs.has(ca)) {
          seenCAs.add(ca);
          mergedLaunches.push(launch);
        }
      }
      
      // Then add seeded tokens that aren't already present
      for (const seed of seededLaunches) {
        const ca = seed.token.toLowerCase();
        if (!seenCAs.has(ca)) {
          seenCAs.add(ca);
          mergedLaunches.push(seed);
        }
      }
      
      // Enrich all launches with DexScreener data for chainId 5042
      const launches = await enrichArcLaunchesWithDex(mergedLaunches);
      
      const argusHits = argusLaunches.length;
      const arcpadHits = arcpadLaunches.length;
      const totalHits = launches.length;
      
      // Format detail as "argus N / arcpad M" or "arcpad N" or "arc wired, 0 tokens"
      let detail: string;
      if (totalHits === 0) {
        detail = "arc wired, 0 tokens";
      } else if (argusHits > 0 && arcpadHits > 0) {
        detail = `argus ${argusHits} / arcpad ${arcpadHits}`;
      } else if (argusHits > 0) {
        detail = `argus ${argusHits}`;
      } else {
        detail = `arcpad ${arcpadHits}`;
      }
      
      const health: HealthSource = {
        name,
        ok: true,
        hits: totalHits,
        attempts: 1,
        ms: Date.now() - t0,
        detail,
      };
      writeLastGood(launches);
      memCache = { launches, health, at: Date.now() };
      return { launches, health };
    } catch (err) {
      const launches = readLastGood();
      const health = fail(name, err, t0);
      memCache = { launches, health, at: Date.now() };
      return { launches, health };
    }
  })();
  
  inflight = run;
  try {
    return await run;
  } finally {
    inflight = null;
  }
}
