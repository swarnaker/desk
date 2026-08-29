import type { Chain } from "./types";

const EVM = /^0x[a-fA-F0-9]{40}$/;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,48}$/;

export function isEvmCa(v: string): boolean {
  return EVM.test(v.trim());
}

/** Sol mint, including pump.fun addresses that end in "pump". */
export function isSolMint(v: string): boolean {
  const s = v.trim();
  if (!s || s.startsWith("0x")) return false;
  if (/pump$/i.test(s)) return BASE58.test(s);
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
}

export function normalizeCa(chain: Chain, ca: string): string {
  const s = ca.trim();
  if (chain === "solana") return s;
  return s.toLowerCase();
}

export function rowId(chain: Chain, ca: string): string {
  return chain + ":" + normalizeCa(chain, ca);
}

export function parseSearch(raw: string): { kind: "evm" | "sol" | "invalid"; ca: string } {
  const s = raw.trim();
  if (isEvmCa(s)) return { kind: "evm", ca: s };
  if (/pump$/i.test(s) || isSolMint(s)) return { kind: "sol", ca: s };
  return { kind: "invalid", ca: s };
}

export function isChain(v: string): v is Chain {
  return v === "robinhood" || v === "base" || v === "solana";
}
