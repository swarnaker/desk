import { canonicalTicker, isCanonical } from "@/lib/line/canonical";
import { CHAINS, isO1Factory, isPonsFactory, isPonsHook, isProtocol, isQuoteAddr, PONS_HOOK, QUOTE_ADDR } from "@/lib/line/constants";
import { rowId } from "@/lib/line/ca";
import { heatScore, isMoving } from "@/lib/line/heat";
import { inferLane } from "@/lib/line/lane";
import { taxEndsIso } from "@/lib/line/physics";
import { riskFromFlags } from "@/lib/line/risk";
import { inferStage } from "@/lib/line/stage";
import type { Chain, Pad, Quote, TokenRow } from "@/lib/line/types";
import { PUMP_GRAD_MCAP } from "@/lib/line/types";
import type { DexPair } from "./dexscreener";
import { numOrNull, pairMakers, pairWebsites, pairX } from "./dexscreener";
import type { FactoryLaunch } from "./factory";

export type Cand = {
  chain: Chain;
  ca: string;
  sources: Set<string>;
  searchQ?: string;
  pair?: DexPair;
  factory?: FactoryLaunch;
  geckoName?: string;
};

export function mapDexChain(id?: string): Chain | null {
  const c = (id || "").toLowerCase();
  if (c === "robinhood" || c === "rh" || c === "4663") return "robinhood";
  if (c === "base" || c === "8453") return "base";
  if (c === "solana" || c === "sol") return "solana";
  return null;
}

export function classifyQuote(pair?: DexPair): { quote: Quote; quoteCa?: string } {
  const q = pair?.quoteToken;
  const addr = (q?.address || "").toLowerCase();
  if (addr && QUOTE_ADDR[addr]) return { quote: QUOTE_ADDR[addr] as Quote, quoteCa: q?.address };
  const sym = (q?.symbol || "").toUpperCase();
  if (sym === "WETH" || sym === "WETH.E") return { quote: "WETH", quoteCa: q?.address };
  if (sym === "ETH") return { quote: "ETH", quoteCa: q?.address };
  if (sym === "USDC") return { quote: "USDC", quoteCa: q?.address };
  if (sym === "USDG") return { quote: "USDG", quoteCa: q?.address };
  if (sym === "SOL" || sym === "WSOL") return { quote: "SOL", quoteCa: q?.address };
  if (sym && !["UNKNOWN", "USD"].includes(sym) && sym.length <= 5 && /^[A-Z.]+$/.test(sym)) {
    if (!["WETH", "ETH", "USDC", "USDG", "SOL"].includes(sym)) return { quote: "STOCK", quoteCa: q?.address };
  }
  return { quote: "UNKNOWN", quoteCa: q?.address };
}

function looksO1(c: Cand): boolean {
  if (c.factory?.pad === "O1") return true;
  if (c.factory && isO1Factory(c.factory.factory)) return true;
  for (const s of c.sources) {
    if (s === "o1:api" || s === "o1:factory" || s.startsWith("o1:")) return true;
  }
  const sites = c.pair ? pairWebsites(c.pair).join(" ").toLowerCase() : "";
  if (sites.includes("launch.o1") || sites.includes("o1.exchange")) return true;
  return false;
}

function hasPonsOfficial(c: Cand): boolean {
  if (c.factory?.pad === "PONS") return true;
  if (isPonsFactory(c.factory?.factory)) return true;
  for (const s of c.sources) {
    if (s === "pons:catalog" || s.startsWith("pons:factory") || s.startsWith("pons:")) return true;
  }
  return false;
}

function pumpDex(pair?: DexPair): boolean {
  const d = (pair?.dexId || "").toLowerCase();
  return d.includes("pump");
}

function isPumpMint(ca?: string): boolean {
  return typeof ca === "string" && /pump$/i.test(ca);
}

/** PumpSwap / Raydium (pump mint) = migrated. Raw pumpfun/pump stay on-curve. */
function pumpGraduated(pair?: DexPair, ca?: string): boolean {
  if (!pair) return false;
  const d = (pair.dexId || "").toLowerCase();
  if (d === "pumpfun" || d === "pump") return false;
  if (d === "pumpswap" || d.includes("pumpswap")) return true;
  if (d.includes("raydium") && isPumpMint(ca || pair.baseToken?.address)) return true;
  return false;
}

function realDeployer(addr?: string): string | undefined {
  if (!addr) return undefined;
  const s = addr.trim();
  if (!s) return undefined;
  if (/^0x0+$/i.test(s)) return undefined;
  if (/^0x[0]+$/.test(s)) return undefined;
  return s;
}

export function classifyPad(c: Cand): Pad {
  const tick = canonicalTicker(c.chain, c.ca);
  if (tick === "BASECAT" || tick === "$O") return "O1";
  if (tick === "CASHCAT") return "BASE"; // RH mascot, not a Pons launch
  if (tick === "PONS") return "PONS";
  if (c.chain === "solana") return "PUMP";
  if (c.factory?.pad === "O1" || looksO1(c)) return "O1";
  // Pad PONS only from catalog / factory V1/V2 — never every robinhood Dex hit.
  if (hasPonsOfficial(c)) return "PONS";
  return "BASE";
}

function ponsHookGraduated(pair?: DexPair): boolean {
  if (!pair) return false;
  const labels = (pair.labels || []).map((x) => x.toLowerCase());
  const blob = labels.join(" ") + " " + (pair.pairAddress || "") + " " + (pair.url || "");
  if (blob.toLowerCase().includes(PONS_HOOK.toLowerCase())) return true;
  if (isPonsHook(pair.pairAddress)) return true;
  return false;
}

function ponsV1Locked(pair?: DexPair, pad?: Pad): boolean {
  if (pad !== "PONS" || !pair) return false;
  const labels = (pair.labels || []).map((x) => x.toLowerCase());
  if (labels.includes("v4")) return false;
  if (ponsHookGraduated(pair)) return false;
  const liq = pair.liquidity?.usd ?? 0;
  return liq >= 400;
}

function curveFill(pad: Pad, pair: DexPair | undefined, graduated: boolean): number | undefined {
  if (pad !== "PONS" && pad !== "PUMP") return undefined;
  if (graduated) return 1;
  if (pad === "PUMP" && pair) {
    const mcap = numOrNull(pair.marketCap) ?? numOrNull(pair.fdv);
    if (mcap == null) return undefined;
    return Math.min(1, Math.max(0, mcap / PUMP_GRAD_MCAP));
  }
  return undefined;
}

export function candToRow(c: Cand, now = Date.now()): TokenRow | null {
  if (isProtocol(c.ca) || isQuoteAddr(c.ca, c.pair?.baseToken?.symbol || c.factory?.symbol || c.geckoName)) return null;
  if (!c.pair && !c.factory) return null;
  const pair = c.pair;
  const pad = classifyPad(c);
  const { quote, quoteCa } = classifyQuote(pair);
  const hasDex = !!pair && !!pair.pairAddress && !/^0x0+$/i.test(pair.pairAddress);
  const fromO1Api = c.sources.has("o1:api");
  const factoryOnly = !hasDex && !!c.factory && !fromO1Api && !c.factory.graduated;
  const hook = ponsHookGraduated(pair);
  const v1 = ponsV1Locked(pair, pad);
  const pumpMig = pad === "PUMP" && pumpGraduated(pair, c.ca);
  const graduated = hook || pumpMig || (pad === "O1" && hasDex) || !!c.factory?.graduated;
  const launchAt = c.factory?.timestampMs ?? (pair?.pairCreatedAt != null ? numOrNull(pair.pairCreatedAt) : undefined);
  const created = c.factory?.timestampMs ?? (pair?.pairCreatedAt != null ? numOrNull(pair.pairCreatedAt) : undefined) ?? launchAt;
  const ageSec = created != null ? Math.max(0, (now - created) / 1000) : undefined;
  const mcapUsd = (pair ? numOrNull(pair.marketCap) ?? numOrNull(pair.fdv) : undefined) ?? c.factory?.mcapUsd;
  const liqUsd = (pair ? numOrNull(pair.liquidity?.usd) : undefined) ?? c.factory?.liqUsd;
  const vol1hUsd = (pair ? numOrNull(pair.volume?.h1) : undefined) ?? c.factory?.vol1hUsd;
  const vol24hUsd = pair ? numOrNull(pair.volume?.h24) : undefined;
  const buys = pair?.txns?.h1?.buys;
  const sells = pair?.txns?.h1?.sells;
  let buyPct: number | undefined;
  if (buys != null && sells != null && buys + sells > 0) buyPct = (buys / (buys + sells)) * 100;
  const fill = curveFill(pad, pair, graduated);
  const stage = inferStage({
    pad,
    hasDexPair: hasDex,
    factoryOnly,
    ageSec,
    launchAtMs: launchAt,
    nowMs: now,
    curveFillPct: fill,
    graduated: graduated || v1,
    ponsHookGraduated: hook,
    ponsV1Locked: v1,
    vol1hUsd,
    liqUsd,
    buyPct,
  });
  if (pad === "O1" && (stage as string) === "ON_CURVE") {
    /* never */
  }
  const moving = isMoving(vol1hUsd, buyPct, liqUsd, ageSec) || stage === "MOVING";
  const printing = (vol1hUsd ?? 0) > 0 && (buyPct ?? 0) >= 50;
  const tick = canonicalTicker(c.chain, c.ca);
  const lane = inferLane({
    pad,
    stage: pad === "O1" && stage === "ON_CURVE" ? "LIVE_POOL" : stage,
    ageSec,
    curveFillPct: pad === "O1" ? undefined : fill,
    printing,
    factoryOnly,
    vol1hUsd,
    moving,
    padSub: tick === "CASHCAT" ? "RH" : undefined,
    liqUsd,
  });
  const safeStage = pad === "O1" && stage === "ON_CURVE" ? "LIVE_POOL" : stage;
  const risk = riskFromFlags([], liqUsd, mcapUsd);
  const heat = heatScore({
    ageSec,
    buyPct,
    vol1hUsd,
    mcapUsd,
    liqUsd,
    moving,
    curveFillPct: pad === "O1" ? undefined : fill,
    inTaxWindow: safeStage === "ANTI_SNIPE",
    riskLevel: risk.level,
    pad,
  });
  const symbol = tick || pair?.baseToken?.symbol || c.factory?.symbol || c.geckoName || "NEW";
  const name = pair?.baseToken?.name || c.factory?.name || c.geckoName || symbol;
  const chainMeta = CHAINS[c.chain];
  const firstSeen = launchAt ?? created ?? now;
  const sources = [...c.sources];
  const makers = pairMakers(pair);
  return {
    id: rowId(c.chain, c.ca),
    symbol,
    name,
    logoUrl: pair?.info?.imageUrl || c.factory?.logo,
    ca: c.chain === "solana" ? c.ca : c.ca.toLowerCase(),
    chain: c.chain,
    pad,
    padSub: tick === "CASHCAT" ? "RH" : undefined,
    quote,
    quoteCa,
    lane,
    stage: safeStage,
    moving,
    heat,
    risk,
    mcapUsd,
    liqUsd,
    vol1hUsd,
    vol24hUsd,
    buyPct,
    buys,
    sells,
    ageSec,
    curveFillPct: pad === "O1" ? undefined : fill,
    taxEndsAt: safeStage === "ANTI_SNIPE" ? taxEndsIso(launchAt, pad) : undefined,
    firstSeenAt: new Date(firstSeen).toISOString(),
    updatedAt: new Date(now).toISOString(),
    sources,
    links: {
      gmgn: chainMeta.gmgn + c.ca,
      dex: pair?.url || chainMeta.dex + c.ca,
      scan: chainMeta.explorer + c.ca,
    },
    xHandle: pair ? pairX(pair) : undefined,
    deployer: realDeployer(c.factory?.deployer),
    uniqueBuyers1h: makers.uniqueBuyers1h,
    uniqueSellers1h: makers.uniqueSellers1h,
    boostsActive: makers.boostsActive,
    deployerLaunchCount7d: null,
    serialAmber: false,
    canonical: isCanonical(c.chain, c.ca),
  };
}

export { pumpDex };
