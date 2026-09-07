export const PONS_FACTORY_V1 = "0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB";
export const PONS_FACTORY_V2 = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e";
export const PONS_GRADUATED_CATALOG_URL =
  "https://www.ponsfamily.com/api/pons-launches/graduations?catalog=1&v=8";

export const TOKEN_LAUNCHED_TOPIC0 =
  "0xdb51ea9ad51ab453a65a4cb7e60c3cb378c9501bb002609f8f97778fb6c4235a";
export const POOL_GRADUATED_TOPIC0 =
  "0x0a44ef75df69c534f43cd6c1aa3ef8983065fe5fe79ef9e79f6494e6f258c259";
export const LAUNCH_SWEPT_TOPIC0 =
  "0xcdb72f157fd3666758a6ce201387ffb52038c7562e4fff352828da1096c4b6b4";

export const PROTOCOL_ADDRESSES = new Set([
  PONS_FACTORY_V1.toLowerCase(),
  PONS_FACTORY_V2.toLowerCase(),
  "0x0c37a24F5D23A486FA692d1500881d698B1F77a4".toLowerCase(),
  "0x7E1EAbd52Ae29598e6483F72dCf1a70b14284dB8".toLowerCase(),
  "0xe33e9e479df8802cb0866d5d05258bec4cf62948".toLowerCase(),
  "0xe5e702641ea86f4ae6cc3cdaed2b886f976be044".toLowerCase(),
  "0x267444d099b10fb5ed7c3cc7b7c767adca574952".toLowerCase(),
  "0xc7819b64a1daecd7ec19856d026cb14efbd89046".toLowerCase(),
  "0x8366a39cc670b4001a1121b8f6a443a643e40951".toLowerCase(),
]);

export const QUOTE_ADDR: Record<string, string> = {
  "0x0bd7d308f8e1639fab988df18a8011f41eacad73": "WETH",
  "0x4200000000000000000000000000000000000006": "WETH",
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC",
  "0x5fc5360d0400a0fd4f2af552add042d716f1d168": "USDG",
  "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2": "USDT",
};

const CANONICAL_SYMS = new Set([
  "weth", "eth", "usdc", "usdt", "usdg", "sol", "wsol",
  "cbeth", "dai", "cbbtc", "wbtc",
]);

export function isProtocol(addr?: string | null): boolean {
  if (!addr) return false;
  return PROTOCOL_ADDRESSES.has(addr.toLowerCase());
}

export function isQuoteAddr(addr?: string | null, symbol?: string | null): boolean {
  if (addr && QUOTE_ADDR[addr.toLowerCase()]) return true;
  if (addr && addr.toLowerCase() === "0x0000000000000000000000000000000000000000") return true;
  const s = (symbol || "").toLowerCase().trim();
  return CANONICAL_SYMS.has(s);
}

export const FIRST_HOUR_SEC = 3600;
export const MAX_AGE_SEC = 3600;
