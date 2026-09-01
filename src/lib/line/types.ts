export type Chain = "robinhood" | "base" | "solana";
export type Pad = "PONS" | "O1" | "BASE" | "PUMP" | "LONG" | "VIRTUALS" | "CLANKER";
export type Lane = "NEW" | "STRETCH" | "BOOK";
export type Stage =
  | "FACTORY"
  | "ANTI_SNIPE"
  | "ON_CURVE"
  | "LIVE_POOL"
  | "GRADUATED"
  | "MOVING";
export type Quote = "ETH" | "WETH" | "USDC" | "USDG" | "STOCK" | "SOL" | "UNKNOWN";
export type RiskLevel = "GREEN" | "AMBER" | "RED";
export type Mood = "ALL" | "BUY" | "SELL" | "WHALES" | "SNIPES";
export type AgeMax = "3h" | "12h" | "any";
export type AgeGate = "1h" | "2h" | "6h" | "any";
export type Bucket = "any" | "1-6h" | "older";
export type LiqMin = 0 | 5000 | 20000 | 50000;
export type McapMin = 0 | 5000 | 20000 | 50000 | 100000;

export type TokenLinks = {
  gmgn: string;
  dex: string;
  scan: string;
};

export type TokenRisk = {
  level: RiskLevel;
  flags: string[];
};

export type TokenClone = {
  chain: Chain;
  ca: string;
  symbol: string;
  mcapUsd?: number;
  canonical: boolean;
};

export type TokenRow = {
  id: string;
  symbol: string;
  name: string;
  logoUrl?: string;
  ca: string;
  chain: Chain;
  pad: Pad;
  padSub?: string;
  quote: Quote;
  quoteCa?: string;
  lane: Lane;
  stage: Stage;
  moving: boolean;
  heat: number;
  risk: TokenRisk;
  mcapUsd?: number;
  liqUsd?: number;
  vol1hUsd?: number;
  vol1hDeltaUsd?: number;
  buyPct?: number;
  buys?: number;
  sells?: number;
  ageSec?: number;
  curveFillPct?: number;
  taxEndsAt?: string;
  firstSeenAt: string;
  updatedAt: string;
  sources: string[];
  links: TokenLinks;
  xHandle?: string;
  holders?: number | null;
  top10Pct?: number | null;
  devPct?: number | null;
  bundlePct?: number | null;
  sniperPct?: number | null;
  mintAuth?: boolean | null;
  sameNameCopies?: number;
  deployer?: string;
  deployerLaunchCount7d?: number | null;
  serialAmber?: boolean;
  uniqueBuyers1h?: number | null;
  uniqueSellers1h?: number | null;
  boostsActive?: number | null;
  birth?: boolean;
  wake?: boolean;
  canonical?: boolean;
  vol24hUsd?: number;
  clones?: TokenClone[];
};


export type Filters = {
  pad: "BOTH" | "ALL" | Pad;
  mood: Mood;
  liqMin: LiqMin;
  mcapMin: McapMin;
  ageMax: AgeMax;
  ageGate: AgeGate;
  /** Bonding-curve firehose. Default false = survived names only. */
  curve: boolean;
  bucket: Bucket;
  o1Gate: boolean;
  desk: boolean;
  watchOnly: boolean;
  firstOnly: boolean;
  birthOnly: boolean;
  wakeOnly: boolean;
  /** Exclusive 1h–12h graduated Pons tape. Off by default. */
  early: boolean;
  hideRisky: boolean;
  stocks: boolean;
};

export type HeatInput = {
  ageSec?: number;
  buyPct?: number;
  vol1hUsd?: number;
  mcapUsd?: number;
  liqUsd?: number;
  moving: boolean;
  curveFillPct?: number;
  inTaxWindow: boolean;
  sameNameCopies?: number;
  bundlePct?: number;
  sniperPct?: number;
  riskLevel: RiskLevel;
  pad: Pad;
};

export type StageInput = {
  pad: Pad;
  hasDexPair: boolean;
  factoryOnly: boolean;
  ageSec?: number;
  launchAtMs?: number;
  nowMs: number;
  curveFillPct?: number;
  graduated: boolean;
  ponsHookGraduated: boolean;
  ponsV1Locked: boolean;
  vol1hUsd?: number;
  liqUsd?: number;
  buyPct?: number;
};

export type HealthSource = {
  name: string;
  ok: boolean;
  hits: number;
  attempts: number;
  ms: number;
  detail?: string;
};

export type RadarBanners = {
  factoryBeforeDex: number;
  mergedFromSnapshot: number;
  staleAgoSec: number | null;
  sameNameCopiesHidden: number;
  hiddenUnderAge: number;
  ponsBooksByMcap?: number;
};

export type RadarPayload = {
  tokens: TokenRow[];
  stale: boolean;
  lastSuccessAt: string | null;
  fetchedAt: string;
  banners: RadarBanners;
  /** 0 = default survived board (Curve off). 1 = include ON_CURVE. */
  on_curve?: 0 | 1;
  health: {
    sources: HealthSource[];
    hits: number;
    attempts: number;
  };
};

export type TapeEvent = {
  id: string;
  chain: Chain;
  ca: string;
  ts: string;
  side?: "buy" | "sell";
  usd?: number;
};

export interface IDataSource {
  listRadar(): Promise<RadarPayload>;
  getToken(chain: Chain, ca: string): Promise<TokenRow | null>;
  listTape(): Promise<TapeEvent[]>;
  health(): Promise<{ sources: HealthSource[]; hits: number; attempts: number }>;
}

export const FIRST_WINDOW_SEC = 2 * 60 * 60;
export const HOUR = 3600;
export const DAY = 24 * HOUR;
/** Default activity gate: unwatched vol1hUsd >= 5k. Watched bypass. */
export const ACTIVITY_VOL1H_USD = 5000;
export const ACTIVITY_TX_1H = 20;
/** Quiet graduated/LIVE Pons or O1 books, mcap >= $30k. */
export const PONS_MCAP_BOOK_USD = 30_000;
/** Tape print: vol1hUsd >= 3k OR uniqueBuyers1h >= 10. Missing buyers is not a print. */
export const TAPE_PRINT_VOL1H = 3000;
export const TAPE_PRINT_BUYERS = 10;
export const PONS_TAX_SEC = 5;
export const O1_TAX_SEC = 16;
export const STRETCH_FILL = 0.7;
export const PUMP_GRAD_MCAP = 43000;
export const PONS_CURVE_ETH = 4.2;
export const THIN_LP_USD = 400;
export const EXTREME_THIN_LP_USD = 200;
/** Far below $5k with a market → THIN LP (AMBER). */
export const MARKET_THIN_LP_USD = 5000;
export const DESK_PADS: Pad[] = ["PONS", "O1"];
/** WAKE extra: uniqueBuyers1h >= 15, else skip WAKE. Missing = skip, never invent 0. */
export const WAKE_UNIQUE_BUYERS_MIN = 15;
/** Hide BOOSTED names when uniqueBuyers1h is known and < 10. Unknown boosts: do not hide. */
export const BOOSTED_HIDE_UNIQUE_BUYERS = 10;
/** AMBER SERIAL: same deployer, this pad, >= 3 launches in 7d with mcap now < $5k. */
export const SERIAL_LAUNCHES_7D = 3;
export const SERIAL_MCAP_USD = 5000;
export const WEEK_SEC = 7 * DAY;
