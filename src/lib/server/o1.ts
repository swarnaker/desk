import fs from "fs";
import path from "path";
import { isEvmCa } from "@/lib/line/ca";
import { isProtocol, isQuoteAddr, O1_LAUNCH_API } from "@/lib/line/constants";
import type { HealthSource } from "@/lib/line/types";
import type { FactoryLaunch } from "./factory";
import { harvestO1Factory } from "./factory";
import { fail, miss } from "./http";

const CACHE_MS = 60_000;
const LAST_DIR = path.join(process.cwd(), "data");

type O1ChainId = 8453 | 4663;

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

function mapO1Item(row: unknown, chainId: O1ChainId): FactoryLaunch | null {
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
    factory: "",
    blockNumber: block,
    txHash: tx,
    timestampMs: Number.isFinite(created) ? created : null,
    name,
    symbol,
    chain: chainId === 8453 ? "base" : "robinhood",
    pad: "O1",
    mcapUsd: mcap,
    liqUsd: liq,
    vol1hUsd: vol1h,
    logo,
    graduated: false,
  };
}

async function fetchO1Sort(
  chainId: O1ChainId,
  sort: "trending",
  key: string,
): Promise<FactoryLaunch[]> {
  const url = O1_LAUNCH_API + "?chain_id=" + chainId + "&market=all&sort=" + sort + "&limit=50";
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "line-radar/1.0",
      "x-api-key": key,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
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
    const mapped = mapO1Item(item, chainId);
    if (mapped) out.push(mapped);
  }
  return out;
}

type O1Pack = { launches: FactoryLaunch[]; health: HealthSource; at: number };

const memCache = new Map<O1ChainId, O1Pack>();
const lastGood = new Map<O1ChainId, FactoryLaunch[]>();
const inflight = new Map<O1ChainId, Promise<{ launches: FactoryLaunch[]; health: HealthSource }>>();

function lastPath(chainId: O1ChainId): string {
  return path.join(LAST_DIR, "o1-last-" + chainId + ".json");
}

function readLastGood(chainId: O1ChainId): FactoryLaunch[] {
  const hit = lastGood.get(chainId);
  if (hit && hit.length) return hit;
  try {
    const parsed = JSON.parse(fs.readFileSync(lastPath(chainId), "utf8")) as unknown;
    if (Array.isArray(parsed) && parsed.length) {
      lastGood.set(chainId, parsed as FactoryLaunch[]);
      return parsed as FactoryLaunch[];
    }
  } catch { /* none */ }
  try {
    const snap = JSON.parse(fs.readFileSync(path.join(LAST_DIR, "radar-snapshot.json"), "utf8")) as {
      tokens?: Array<{
        ca: string; chain: string; sources?: string[]; symbol?: string; name?: string;
        mcapUsd?: number; liqUsd?: number; vol1hUsd?: number; deployer?: string; firstSeenAt?: string;
      }>;
    };
    const want = chainId === 8453 ? "base" : "robinhood";
    const launches: FactoryLaunch[] = [];
    for (const row of snap.tokens || []) {
      if (row.chain !== want) continue;
      const src = row.sources || [];
      if (!src.some((s) => s === "o1:api" || s.startsWith("o1:"))) continue;
      launches.push({
        token: row.ca,
        deployer: row.deployer || "0x0000000000000000000000000000000000000000",
        factory: "",
        blockNumber: 0,
        txHash: "",
        timestampMs: row.firstSeenAt ? Date.parse(row.firstSeenAt) : null,
        name: row.name,
        symbol: row.symbol,
        chain: want,
        pad: "O1",
        mcapUsd: row.mcapUsd,
        liqUsd: row.liqUsd,
        vol1hUsd: row.vol1hUsd,
        graduated: false,
      });
    }
    if (launches.length) lastGood.set(chainId, launches);
    return launches;
  } catch {
    return [];
  }
}

function writeLastGood(chainId: O1ChainId, launches: FactoryLaunch[]) {
  lastGood.set(chainId, launches);
  try {
    fs.mkdirSync(LAST_DIR, { recursive: true });
    const tmp = lastPath(chainId) + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(launches));
    fs.renameSync(tmp, lastPath(chainId));
  } catch { /* disk */ }
}

export async function fetchO1LaunchApi(
  chainId: O1ChainId,
): Promise<{ launches: FactoryLaunch[]; health: HealthSource }> {
  const name = "o1 launch API chain " + chainId;
  const key = process.env.O1_API_KEY;
  if (!key) {
    return { launches: [], health: miss(name, "not wired") };
  }
  const cached = memCache.get(chainId);
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return { launches: cached.launches, health: cached.health };
  }
  const pending = inflight.get(chainId);
  if (pending) return pending;

  const run = (async () => {
    const t0 = Date.now();
    try {
      const launches = await fetchO1Sort(chainId, "trending", key);
      const health: HealthSource = {
        name, ok: true, hits: 1, attempts: 1, ms: Date.now() - t0, detail: launches.length + " tokens",
      };
      writeLastGood(chainId, launches);
      memCache.set(chainId, { launches, health, at: Date.now() });
      return { launches, health };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const health: HealthSource = (msg.includes("unauthorized") || msg.includes("401"))
        ? miss(name, "unauthorized")
        : fail(name, err, t0);
      const launches = readLastGood(chainId);
      memCache.set(chainId, { launches, health, at: Date.now() });
      return { launches, health };
    }
  })();

  inflight.set(chainId, run);
  try {
    return await run;
  } finally {
    inflight.delete(chainId);
  }
}

export { harvestO1Factory };
