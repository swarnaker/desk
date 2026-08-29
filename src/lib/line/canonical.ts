import type { Chain } from "./types";

export type CanonicalPin = {
  chain: Chain;
  ca: string;
  ticker: string;
};

/** Pinned CAs. Compare chain + lowercase address. Dedup is chain:ca. */
export const CANONICAL_PINS: CanonicalPin[] = [
  { chain: "robinhood", ca: "0x020bfC650A365f8BB26819deAAbF3E21291018b4", ticker: "CASHCAT" },
  { chain: "base", ca: "0xB2000000000000000000004c27f6523082f41D01", ticker: "BASECAT" },
  { chain: "robinhood", ca: "0x39dBED3a2bd333467115dE45665cC57F813C4571", ticker: "PONS" },
  { chain: "base", ca: "0x182FA643E5f29d5EcA75e7b9CF9336A3fe4620b2", ticker: "$O" },
];

function pinKey(chain: string, ca: string): string {
  return chain.toLowerCase() + ":" + ca.toLowerCase();
}

const PIN_BY_KEY = new Map(CANONICAL_PINS.map((p) => [pinKey(p.chain, p.ca), p]));

export function isCanonical(chain: string, ca: string): boolean {
  return PIN_BY_KEY.has(pinKey(chain, ca));
}

export function canonicalTicker(chain: string, ca: string): string | undefined {
  return PIN_BY_KEY.get(pinKey(chain, ca))?.ticker;
}

export function canonicalPin(chain: string, ca: string): CanonicalPin | undefined {
  return PIN_BY_KEY.get(pinKey(chain, ca));
}

export function canonicalAddresses(chain: Chain): string[] {
  return CANONICAL_PINS.filter((p) => p.chain === chain).map((p) => p.ca);
}
