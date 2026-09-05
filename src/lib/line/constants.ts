import type { Chain } from "./types";

export const PONS_FACTORY_V1 = "0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB";
export const PONS_FACTORY_V2 = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e";
/** @deprecated alias of V2 */
export const PONS_FACTORY = PONS_FACTORY_V2;
export const PONS_FACTORY_ALT_A = "0x0c37a24F5D23A486FA692d1500881d698B1F77a4";
export const PONS_FACTORY_ALT_B = "0x7E1EAbd52Ae29598e6483F72dCf1a70b14284dB8";
export const PONS_ROUTER = "0xe33e9e479df8802cb0866d5d05258bec4cf62948";
export const PONS_HOOK = "0xe5e702641ea86f4ae6cc3cdaed2b886f976be044";
export const PONS_LOCKER = "0x267444d099b10fb5ed7c3cc7b7c767adca574952";
export const PONS_GRAD_EXEC = "0xc7819b64a1daecd7ec19856d026cb14efbd89046";
/** Uni v4 PoolManager — never a Pons filter. */
export const UNI_V4_POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
export const O1_BASE_FACTORY = "0xa52ad458cE0282a971ecC71C051A32f28946bb9F";
export const O1_RWA_FACTORY = "0xFf70918Ef17A2D74d683a8297813B177BaFaD1f4";
export const O1_RH_FACTORY = "0x411F21283D3E492BC395027329e08f9F4F560Ba5";
export const PONS_GRADUATED_CATALOG_URL =
  "https://www.ponsfamily.com/api/pons-launches/graduations?catalog=1&v=8";
export const O1_LAUNCH_API = "https://api.launch.o1.exchange/v1/tokens";

export const TOKEN_LAUNCHED_TOPIC0 =
  "0xdb51ea9ad51ab453a65a4cb7e60c3cb378c9501bb002609f8f97778fb6c4235a";
export const O1_LAUNCHED_TOPIC0 =
  "0x207384e895174175cc774fe7f7457b37c382f27ebf53d37d5257b862f80eaf9c";
export const POOL_GRADUATED_TOPIC0 =
  "0x0a44ef75df69c534f43cd6c1aa3ef8983065fe5fe79ef9e79f6494e6f258c259";
export const LAUNCH_SWEPT_TOPIC0 =
  "0xcdb72f157fd3666758a6ce201387ffb52038c7562e4fff352828da1096c4b6b4";

const PROTO = [
  PONS_FACTORY_V1,
  PONS_FACTORY_V2,
  PONS_FACTORY_ALT_A,
  PONS_FACTORY_ALT_B,
  PONS_ROUTER,
  PONS_HOOK,
  PONS_LOCKER,
  PONS_GRAD_EXEC,
  UNI_V4_POOL_MANAGER,
  O1_BASE_FACTORY,
  O1_RWA_FACTORY,
  O1_RH_FACTORY,
].map((a) => a.toLowerCase());

export const PROTOCOL_SET = new Set(PROTO);

export function isProtocol(addr?: string | null): boolean {
  if (!addr) return false;
  return PROTOCOL_SET.has(addr.toLowerCase());
}

export function isPonsHook(addr?: string | null): boolean {
  return !!addr && addr.toLowerCase() === PONS_HOOK.toLowerCase();
}

export function isPonsFactory(addr?: string | null): boolean {
  if (!addr) return false;
  const a = addr.toLowerCase();
  return (
    a === PONS_FACTORY_V1.toLowerCase() ||
    a === PONS_FACTORY_V2.toLowerCase() ||
    a === PONS_FACTORY_ALT_A.toLowerCase() ||
    a === PONS_FACTORY_ALT_B.toLowerCase()
  );
}

export function isO1Factory(addr?: string | null): boolean {
  if (!addr) return false;
  const a = addr.toLowerCase();
  return (
    a === O1_BASE_FACTORY.toLowerCase() ||
    a === O1_RWA_FACTORY.toLowerCase() ||
    a === O1_RH_FACTORY.toLowerCase()
  );
}

export const QUOTE_ADDR: Record<string, string> = {
  "0x0bd7d308f8e1639fab988df18a8011f41eacad73": "WETH",
  "0x4200000000000000000000000000000000000006": "WETH",
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC",
  "0x5fc5360d0400a0fd4f2af552add042d716f1d168": "USDG",
  "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2": "USDT",
  "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22": "cbETH",
  "0x50c5725949a6f0c72e6c4a642f54346ff4e4d7b1": "DAI",
  "0xcbb7c0000ab88b473b1f5afd9ef808440eed65d5": "cbBTC",
  so11111111111111111111111111111111111111112: "SOL",
};

const CANONICAL_SYMS = new Set([
  "weth", "eth", "usdc", "usdt", "usdg", "sol", "wsol",
  "cbeth", "dai", "cbbtc", "wbtc", "weth.e",
]);

export const CHAINS: Record<
  Chain,
  { slug: Chain; name: string; explorer: string; dex: string; gmgn: string }
> = {
  robinhood: {
    slug: "robinhood",
    name: "Robinhood",
    explorer: "https://robinhoodchain.blockscout.com/token/",
    dex: "https://dexscreener.com/robinhood/",
    gmgn: "https://gmgn.ai/robinhood/token/",
  },
  base: {
    slug: "base",
    name: "Base",
    explorer: "https://base.blockscout.com/token/",
    dex: "https://dexscreener.com/base/",
    gmgn: "https://gmgn.ai/base/token/",
  },
  solana: {
    slug: "solana",
    name: "Solana",
    explorer: "https://solscan.io/token/",
    dex: "https://dexscreener.com/solana/",
    gmgn: "https://gmgn.ai/sol/token/",
  },
};

export const COPY = {
  signal: "SIGNAL ONLY",
  never: "LINE never holds keys and never swaps. Paste CA in the header to open a token.",
  newNames: "New names on Pons and Base",
  top: "TOP IS NEW + MOVERS",
  topBody:
    "Fresh launches and CAs that just started printing buys jump to the top. Stage is inferred from pair age and liquidity/mcap — not an official pad graduation.",
  searchPh: "Paste CA / Sol mint",
  drawdown: "drawdown rules → docs/wallet-security",
};

export function isQuoteAddr(addr?: string | null, symbol?: string | null): boolean {
  if (addr && QUOTE_ADDR[addr.toLowerCase()]) return true;
  if (addr && addr.toLowerCase() === "0x0000000000000000000000000000000000000000") return true;
  const s = (symbol || "").toLowerCase().trim();
  return CANONICAL_SYMS.has(s);
}
