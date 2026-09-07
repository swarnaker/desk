import {
  isProtocol,
  isQuoteAddr,
  PONS_GRADUATED_CATALOG_URL,
  PONS_FACTORY_V2,
  POOL_GRADUATED_TOPIC0,
  LAUNCH_SWEPT_TOPIC0,
  TOKEN_LAUNCHED_TOPIC0,
  MAX_AGE_SEC,
} from "./constants";
import type { FirstHourToken, HealthSource } from "./types";
import { heatScore, isMoving } from "./heat";

const TIMEOUT_MS = 4000;
const CACHE_MS = 5 * 60 * 1000;

type CatalogRow = {
  factory?: string;
  token?: string;
  deployer?: string;
  transactionHash?: string;
  blockNumber?: number;
  launchedAt?: string;
  graduatedAt?: string;
  name?: string;
  symbol?: string;
  logo?: string;
  marketCapUsd?: number | null;
  realMcapUsd?: number | null;
  liquidityUsd?: number | null;
  graduated?: boolean;
};

type RpcLog = {
  address?: string;
  topics?: string[];
  data?: string;
  blockNumber?: string;
  transactionHash?: string;
};

type DexPair = {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: {
    address?: string;
    name?: string;
    symbol?: string;
  };
  quoteToken?: {
    address?: string;
    name?: string;
    symbol?: string;
  };
  priceNative?: string;
  priceUsd?: string;
  txns?: {
    m5?: { buys?: number; sells?: number };
    h1?: { buys?: number; sells?: number };
    h6?: { buys?: number; sells?: number };
    h24?: { buys?: number; sells?: number };
  };
  volume?: {
    h24?: number;
    h6?: number;
    h1?: number;
    m5?: number;
  };
  priceChange?: {
    m5?: number;
    h1?: number;
    h6?: number;
    h24?: number;
  };
  liquidity?: {
    usd?: number;
    base?: number;
    quote?: number;
  };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    websites?: { label?: string; url?: string }[];
    socials?: { type?: string; url?: string }[];
  };
};

type DexScreenerResponse = {
  schemaVersion?: string;
  pairs?: DexPair[];
};

let catalogCache: { tokens: FirstHourToken[]; at: number } | null = null;
let rpcGraduatedCache: { tokens: FirstHourToken[]; at: number } | null = null;
let rpcBondingCache: { tokens: FirstHourToken[]; at: number } | null = null;

function num(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function topicToAddress(topic: string | undefined): string | null {
  if (!topic || topic.length < 66) return null;
  const addr = "0x" + topic.slice(-40);
  return /^0x[a-fA-F0-9]{40}$/.test(addr) ? addr : null;
}

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || "HTTP " + res.status);
  }
  return json.result as T;
}

async function fetchDexScreener(tokenAddress: string): Promise<DexPair | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as DexScreenerResponse;
    const pairs = data.pairs || [];
    const pair = pairs.find(p => p.chainId === "robinhood") || pairs[0];
    return pair || null;
  } catch {
    return null;
  }
}

async function resolveTokenMetadata(
  tokenAddress: string,
  rpcUrl: string | undefined
): Promise<{ name?: string; symbol?: string }> {
  if (!rpcUrl) return {};

  try {
    const nameData = "0x06fdde03";
    const symbolData = "0x95d89b41";

    const [nameHex, symbolHex] = await Promise.all([
      rpc<string>(rpcUrl, "eth_call", [
        { to: tokenAddress, data: nameData },
        "latest",
      ]).catch(() => "0x"),
      rpc<string>(rpcUrl, "eth_call", [
        { to: tokenAddress, data: symbolData },
        "latest",
      ]).catch(() => "0x"),
    ]);

    const name = decodeString(nameHex);
    const symbol = decodeString(symbolHex);

    return { name, symbol };
  } catch {
    return {};
  }
}

function decodeString(hex: string): string | undefined {
  if (!hex || hex === "0x" || hex.length < 130) return undefined;
  try {
    const dataHex = hex.slice(130);
    const bytes = [];
    for (let i = 0; i < dataHex.length; i += 2) {
      const byte = parseInt(dataHex.slice(i, i + 2), 16);
      if (byte > 0) bytes.push(byte);
    }
    const decoded = String.fromCharCode(...bytes).trim();
    return decoded.length > 0 ? decoded : undefined;
  } catch {
    return undefined;
  }
}

async function fetchCatalog(): Promise<{ tokens: FirstHourToken[]; health: HealthSource }> {
  const name = "Pons catalog";
  const t0 = Date.now();

  if (catalogCache && Date.now() - catalogCache.at < CACHE_MS) {
    return {
      tokens: catalogCache.tokens,
      health: {
        name,
        ok: true,
        hits: 1,
        attempts: 1,
        ms: Date.now() - t0,
        detail: `${catalogCache.tokens.length} graduated (cached)`,
      },
    };
  }

  try {
    const res = await fetch(PONS_GRADUATED_CATALOG_URL, {
      headers: { accept: "application/json", "user-agent": "firsthour/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) throw new Error("HTTP " + res.status);

    const raw = (await res.json()) as unknown;
    const rows = Array.isArray(raw) ? raw : Array.isArray((raw as any).data) ? (raw as any).data : [];

    const tokens: FirstHourToken[] = [];
    const seen = new Set<string>();
    const now = Date.now();

    for (const row of rows as CatalogRow[]) {
      const token = (row.token || "").trim();
      if (!token || !/^0x[a-fA-F0-9]{40}$/i.test(token)) continue;
      if (row.graduated !== true) continue;
      if (isProtocol(token) || isQuoteAddr(token, row.symbol)) continue;

      const key = token.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const launched = row.launchedAt ? Date.parse(row.launchedAt) : NaN;
      const graduatedAt = row.graduatedAt ? Date.parse(row.graduatedAt) : NaN;
      const ts = Number.isFinite(launched) ? launched : Number.isFinite(graduatedAt) ? graduatedAt : now;
      const ageSec = Math.floor((now - ts) / 1000);

      if (ageSec >= MAX_AGE_SEC) continue;

      const mcap = num(row.realMcapUsd) ?? num(row.marketCapUsd);
      const liq = num(row.liquidityUsd);

      tokens.push({
        token,
        deployer: row.deployer || "0x0000000000000000000000000000000000000000",
        factory: row.factory || PONS_FACTORY_V2,
        blockNumber: typeof row.blockNumber === "number" ? row.blockNumber : 0,
        txHash: row.transactionHash || "",
        timestampMs: ts,
        name: row.name,
        symbol: row.symbol,
        chain: "robinhood",
        pad: "PONS",
        mcapUsd: mcap,
        liqUsd: liq,
        logo: row.logo,
        graduated: true,
        ageSec,
      });
    }

    catalogCache = { tokens, at: Date.now() };

    return {
      tokens,
      health: {
        name,
        ok: true,
        hits: 1,
        attempts: 1,
        ms: Date.now() - t0,
        detail: `${tokens.length} graduated`,
      },
    };
  } catch (err) {
    if (catalogCache) {
      return {
        tokens: catalogCache.tokens,
        health: {
          name,
          ok: true,
          hits: 1,
          attempts: 1,
          ms: Date.now() - t0,
          detail: `${catalogCache.tokens.length} graduated (last good)`,
        },
      };
    }

    return {
      tokens: [],
      health: {
        name,
        ok: false,
        hits: 0,
        attempts: 1,
        ms: Date.now() - t0,
        detail: err instanceof Error ? err.message : "unknown error",
      },
    };
  }
}

async function fetchRpcGraduations(
  rpcUrl: string
): Promise<{ tokens: FirstHourToken[]; health: HealthSource }> {
  const name = "RPC graduations";
  const t0 = Date.now();

  if (rpcGraduatedCache && Date.now() - rpcGraduatedCache.at < CACHE_MS) {
    return {
      tokens: rpcGraduatedCache.tokens,
      health: {
        name,
        ok: true,
        hits: 1,
        attempts: 1,
        ms: Date.now() - t0,
        detail: `${rpcGraduatedCache.tokens.length} RPC grads (cached)`,
      },
    };
  }

  try {
    const headHex = await rpc<string>(rpcUrl, "eth_blockNumber", []);
    const head = Number.parseInt(headHex, 16);
    const from = Math.max(0, head - 80_000);

    const [poolGradLogs, sweptLogs] = await Promise.all([
      rpc<RpcLog[]>(rpcUrl, "eth_getLogs", [
        {
          address: PONS_FACTORY_V2,
          fromBlock: "0x" + from.toString(16),
          toBlock: "0x" + head.toString(16),
          topics: [POOL_GRADUATED_TOPIC0],
        },
      ]),
      rpc<RpcLog[]>(rpcUrl, "eth_getLogs", [
        {
          address: PONS_FACTORY_V2,
          fromBlock: "0x" + from.toString(16),
          toBlock: "0x" + head.toString(16),
          topics: [LAUNCH_SWEPT_TOPIC0],
        },
      ]),
    ]);

    const seen = new Set<string>();
    const tokens: FirstHourToken[] = [];
    const now = Date.now();

    for (const log of [...poolGradLogs, ...sweptLogs]) {
      const topics = log.topics || [];
      const topic0 = topics[0]?.toLowerCase();
      if (topic0 !== POOL_GRADUATED_TOPIC0 && topic0 !== LAUNCH_SWEPT_TOPIC0) continue;

      const token = topicToAddress(topics[1]);
      if (!token || isProtocol(token)) continue;

      const key = token.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const blockNumber = log.blockNumber ? Number.parseInt(log.blockNumber, 16) : 0;
      const estimatedTs = now - ((head - blockNumber) / 10) * 1000;
      const ageSec = Math.floor((now - estimatedTs) / 1000);

      if (ageSec >= MAX_AGE_SEC) continue;

      tokens.push({
        token,
        deployer: "0x0000000000000000000000000000000000000000",
        factory: PONS_FACTORY_V2,
        blockNumber,
        txHash: log.transactionHash || "",
        timestampMs: estimatedTs,
        chain: "robinhood",
        pad: "PONS",
        graduated: true,
        ageSec,
        pool: "0x0",
      });
    }

    rpcGraduatedCache = { tokens, at: Date.now() };

    return {
      tokens,
      health: {
        name,
        ok: true,
        hits: 1,
        attempts: 1,
        ms: Date.now() - t0,
        detail: `${tokens.length} RPC grads`,
      },
    };
  } catch (err) {
    if (rpcGraduatedCache) {
      return {
        tokens: rpcGraduatedCache.tokens,
        health: {
          name,
          ok: true,
          hits: 1,
          attempts: 1,
          ms: Date.now() - t0,
          detail: `${rpcGraduatedCache.tokens.length} RPC grads (last good)`,
        },
      };
    }

    return {
      tokens: [],
      health: {
        name,
        ok: false,
        hits: 0,
        attempts: 1,
        ms: Date.now() - t0,
        detail: err instanceof Error ? err.message : "unknown error",
      },
    };
  }
}

async function fetchRpcBonding(
  rpcUrl: string
): Promise<{ tokens: FirstHourToken[]; health: HealthSource }> {
  const name = "RPC bonding";
  const t0 = Date.now();

  if (rpcBondingCache && Date.now() - rpcBondingCache.at < CACHE_MS) {
    return {
      tokens: rpcBondingCache.tokens,
      health: {
        name,
        ok: true,
        hits: 1,
        attempts: 1,
        ms: Date.now() - t0,
        detail: `${rpcBondingCache.tokens.length} bonding (cached)`,
      },
    };
  }

  try {
    const headHex = await rpc<string>(rpcUrl, "eth_blockNumber", []);
    const head = Number.parseInt(headHex, 16);
    const from = Math.max(0, head - 80_000);

    const launchedLogs = await rpc<RpcLog[]>(rpcUrl, "eth_getLogs", [
      {
        address: PONS_FACTORY_V2,
        fromBlock: "0x" + from.toString(16),
        toBlock: "0x" + head.toString(16),
        topics: [TOKEN_LAUNCHED_TOPIC0],
      },
    ]);

    const seen = new Set<string>();
    const tokens: FirstHourToken[] = [];
    const now = Date.now();

    for (const log of launchedLogs) {
      const topics = log.topics || [];
      const topic0 = topics[0]?.toLowerCase();
      if (topic0 !== TOKEN_LAUNCHED_TOPIC0) continue;

      const token = topicToAddress(topics[1]);
      if (!token || isProtocol(token)) continue;

      const key = token.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const blockNumber = log.blockNumber ? Number.parseInt(log.blockNumber, 16) : 0;
      const estimatedTs = now - ((head - blockNumber) / 10) * 1000;
      const ageSec = Math.floor((now - estimatedTs) / 1000);

      if (ageSec >= MAX_AGE_SEC) continue;

      tokens.push({
        token,
        deployer: "0x0000000000000000000000000000000000000000",
        factory: PONS_FACTORY_V2,
        blockNumber,
        txHash: log.transactionHash || "",
        timestampMs: estimatedTs,
        chain: "robinhood",
        pad: "PONS",
        graduated: false,
        ageSec,
      });
    }

    rpcBondingCache = { tokens, at: Date.now() };

    let detail = `${tokens.length} bonding`;
    if (tokens.length === 0) {
      if (launchedLogs.length === 0) {
        detail = "0 bonding (no logs in block window)";
      } else {
        detail = "0 bonding (all filtered or parse miss)";
      }
    }

    return {
      tokens,
      health: {
        name,
        ok: true,
        hits: 1,
        attempts: 1,
        ms: Date.now() - t0,
        detail,
      },
    };
  } catch (err) {
    if (rpcBondingCache) {
      return {
        tokens: rpcBondingCache.tokens,
        health: {
          name,
          ok: true,
          hits: 1,
          attempts: 1,
          ms: Date.now() - t0,
          detail: `${rpcBondingCache.tokens.length} bonding (last good)`,
        },
      };
    }

    return {
      tokens: [],
      health: {
        name,
        ok: false,
        hits: 0,
        attempts: 1,
        ms: Date.now() - t0,
        detail: err instanceof Error ? err.message : "unknown error",
      },
    };
  }
}

export async function fetchPonsTokens(): Promise<{
  tokens: FirstHourToken[];
  health: HealthSource[];
}> {
  const rpcUrl = process.env.ROBINHOOD_RPC_URL;
  const health: HealthSource[] = [];

  const catalogResult = await fetchCatalog();
  health.push(catalogResult.health);

  let rpcGraduatedTokens: FirstHourToken[] = [];
  let rpcBondingTokens: FirstHourToken[] = [];

  if (rpcUrl) {
    const [graduatedResult, bondingResult] = await Promise.all([
      fetchRpcGraduations(rpcUrl),
      fetchRpcBonding(rpcUrl),
    ]);
    health.push(graduatedResult.health);
    health.push(bondingResult.health);
    rpcGraduatedTokens = graduatedResult.tokens;
    rpcBondingTokens = bondingResult.tokens;
  } else {
    health.push({
      name: "RPC graduations",
      ok: false,
      hits: 0,
      attempts: 0,
      ms: 0,
      detail: "rpc not wired",
    });
    health.push({
      name: "RPC bonding",
      ok: false,
      hits: 0,
      attempts: 0,
      ms: 0,
      detail: "rpc not wired",
    });
  }

  const tokenMap = new Map<string, FirstHourToken>();

  for (const token of [...catalogResult.tokens, ...rpcGraduatedTokens, ...rpcBondingTokens]) {
    const key = token.token.toLowerCase();
    const existing = tokenMap.get(key);

    if (!existing) {
      tokenMap.set(key, token);
    } else if (token.name && !existing.name) {
      tokenMap.set(key, { ...existing, ...token });
    } else if (token.graduated && !existing.graduated) {
      tokenMap.set(key, { ...existing, graduated: true });
    }
  }

  let tokens = Array.from(tokenMap.values());

  const enrichmentPromises = tokens.map(async (token) => {
    const dexData = await fetchDexScreener(token.token);

    if (dexData) {
      if (!token.symbol || token.symbol === "???" || token.symbol === "Unknown") {
        const baseSymbol = dexData.baseToken?.symbol;
        if (baseSymbol && baseSymbol !== "???" && baseSymbol !== "Unknown") {
          token.symbol = baseSymbol;
        }
      }
      if (!token.name || token.name === "???" || token.name === "Unknown") {
        const baseName = dexData.baseToken?.name;
        if (baseName && baseName !== "???" && baseName !== "Unknown") {
          token.name = baseName;
        }
      }

      if (dexData.volume?.h1 != null) {
        token.vol1hUsd = dexData.volume.h1;
      }

      if (dexData.txns?.h1) {
        const buys = dexData.txns.h1.buys || 0;
        const sells = dexData.txns.h1.sells || 0;
        const total = buys + sells;
        if (total > 0) {
          token.buyPct = (buys / total) * 100;
        }
      }

      if (dexData.priceChange?.m5 != null) {
        token.priceChange5m = dexData.priceChange.m5;
      }

      if (dexData.liquidity?.usd != null) {
        token.liqUsd = dexData.liquidity.usd;
      }

      if (dexData.fdv != null) {
        token.mcapUsd = dexData.fdv;
      } else if (dexData.marketCap != null) {
        token.mcapUsd = dexData.marketCap;
      }

      if (!token.graduated && token.liqUsd != null && token.mcapUsd != null) {
        const curveCapacity = 85000;
        const curveFill = Math.min(token.liqUsd, curveCapacity);
        token.curveFillPct = Math.min((curveFill / curveCapacity) * 100, 100);
      }

      if (!token.logo && dexData.info?.imageUrl) {
        token.logo = dexData.info.imageUrl;
      }

      if (dexData.quoteToken?.symbol) {
        token.quoteSymbol = dexData.quoteToken.symbol;
      }
    }

    if (
      rpcUrl &&
      (!token.symbol || token.symbol === "???" || token.symbol === "Unknown" ||
       !token.name || token.name === "???" || token.name === "Unknown")
    ) {
      const metadata = await resolveTokenMetadata(token.token, rpcUrl);
      if (metadata.symbol && metadata.symbol !== "???") {
        token.symbol = metadata.symbol;
      }
      if (metadata.name && metadata.name !== "???") {
        token.name = metadata.name;
      }
    }
  });

  await Promise.all(enrichmentPromises);

  const tickerGroups = new Map<string, FirstHourToken[]>();
  for (const token of tokens) {
    const ticker = (token.symbol || "").toUpperCase().trim();
    if (!ticker || ticker === "???" || ticker === "UNKNOWN") continue;
    
    if (!tickerGroups.has(ticker)) {
      tickerGroups.set(ticker, []);
    }
    tickerGroups.get(ticker)!.push(token);
  }

  for (const token of tokens) {
    if (token.ageSec == null && token.timestampMs) {
      token.ageSec = Math.floor((Date.now() - token.timestampMs) / 1000);
    }

    const moving = isMoving(token.vol1hUsd, token.buyPct, token.liqUsd, token.ageSec);
    token.moving = moving;

    token.heat = heatScore({
      ageSec: token.ageSec,
      buyPct: token.buyPct,
      vol1hUsd: token.vol1hUsd,
      mcapUsd: token.mcapUsd,
      liqUsd: token.liqUsd,
      moving,
      pad: token.pad,
      curveFillPct: token.curveFillPct,
    });
  }

  const hiddenTokens = new Set<string>();
  
  for (const [ticker, group] of tickerGroups.entries()) {
    if (group.length <= 1) continue;

    group.sort((a, b) => (b.heat || 0) - (a.heat || 0));

    if (group[1]) {
      const currentSymbol = group[1].symbol || "";
      if (!currentSymbol.endsWith(" COPY")) {
        group[1].symbol = currentSymbol + " COPY";
      }
    }
    
    for (let i = 2; i < group.length; i++) {
      hiddenTokens.add(group[i].token.toLowerCase());
    }
  }

  tokens = tokens.filter(token => !hiddenTokens.has(token.token.toLowerCase()));

  return { tokens, health };
}
