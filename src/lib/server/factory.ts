import {
  isO1Factory, isPonsFactory, isProtocol, O1_BASE_FACTORY, O1_LAUNCHED_TOPIC0,
  PONS_FACTORY_V1, PONS_FACTORY_V2, TOKEN_LAUNCHED_TOPIC0,
} from "@/lib/line/constants";
import type { HealthSource } from "@/lib/line/types";
import { fail, miss } from "./http";

export type FactoryLaunch = {
  token: string;
  deployer: string;
  factory: string;
  blockNumber: number;
  txHash: string;
  timestampMs: number | null;
  name?: string;
  symbol?: string;
  chain: "robinhood" | "base" | "solana";
  pad: "PONS" | "O1" | "VIRTUALS" | "CLANKER";
  mcapUsd?: number;
  liqUsd?: number;
  vol1hUsd?: number;
  logo?: string;
  graduated?: boolean;
};

type RpcLog = {
  address?: string;
  topics?: string[];
  data?: string;
  blockNumber?: string;
  transactionHash?: string;
};

function topicToAddress(topic: string | undefined): string | null {
  if (!topic || topic.length < 66) return null;
  const addr = "0x" + topic.slice(-40);
  return /^0x[a-fA-F0-9]{40}$/.test(addr) ? addr : null;
}

async function rpc<T>(url: string, method: string, params: unknown[], source: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(4000),
    cache: "no-store",
  });
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (!res.ok || json.error) throw new Error(source + ": " + (json.error?.message || "HTTP " + res.status));
  return json.result as T;
}

function parsePonsLog(log: RpcLog, factory: string): FactoryLaunch | null {
  const topics = log.topics || [];
  if (!topics[0] || topics[0].toLowerCase() !== TOKEN_LAUNCHED_TOPIC0) return null;
  const token = topicToAddress(topics[1]);
  if (!token || isProtocol(token)) return null;
  const deployer = topicToAddress(topics[2]) || "0x0000000000000000000000000000000000000000";
  const fac = (log.address && isPonsFactory(log.address) ? log.address : factory);
  return {
    token,
    deployer,
    factory: fac,
    blockNumber: log.blockNumber ? Number.parseInt(log.blockNumber, 16) : 0,
    txHash: log.transactionHash || "",
    timestampMs: null,
    chain: "robinhood",
    pad: "PONS",
  };
}

function parseO1Log(log: RpcLog, factory: string): FactoryLaunch | null {
  if (!isO1Factory(factory)) return null;
  const topics = log.topics || [];
  if (!topics[0] || topics[0].toLowerCase() !== O1_LAUNCHED_TOPIC0) return null;
  const token = topicToAddress(topics[1]);
  if (!token || isProtocol(token)) return null;
  const deployer = topicToAddress(topics[3]) || "0x0000000000000000000000000000000000000000";
  return {
    token,
    deployer,
    factory,
    blockNumber: log.blockNumber ? Number.parseInt(log.blockNumber, 16) : 0,
    txHash: log.transactionHash || "",
    timestampMs: null,
    chain: "base",
    pad: "O1",
  };
}

async function harvestPonsFactoryAt(
  factory: string,
  name: string,
): Promise<{ launches: FactoryLaunch[]; health: HealthSource }> {
  const rpcUrl = process.env.ROBINHOOD_RPC_URL;
  if (!rpcUrl) {
    return { launches: [], health: miss(name, "not wired") };
  }
  const t0 = Date.now();
  try {
    const headHex = await rpc<string>(rpcUrl, "eth_blockNumber", [], name);
    const head = Number.parseInt(headHex, 16);
    const from = Math.max(0, head - 80_000);
    const logs = await rpc<RpcLog[]>(rpcUrl, "eth_getLogs", [{
      address: factory,
      fromBlock: "0x" + from.toString(16),
      toBlock: "0x" + head.toString(16),
      topics: [TOKEN_LAUNCHED_TOPIC0],
    }], name);
    const launches = (logs || []).map((l) => parsePonsLog(l, factory)).filter((x): x is FactoryLaunch => !!x);
    const now = Date.now();
    for (const l of launches) {
      if (l.blockNumber && head) l.timestampMs = now - ((head - l.blockNumber) / 10) * 1000;
    }
    return { launches, health: { name, ok: true, hits: 1, attempts: 1, ms: Date.now() - t0, detail: launches.length + " launches" } };
  } catch (err) {
    const bq = process.env.BITQUERY_API_KEY;
    if (bq && factory.toLowerCase() === PONS_FACTORY_V2.toLowerCase()) return harvestPonsBitquery(bq, name);
    return { launches: [], health: fail(name, err, t0) };
  }
}

export async function harvestPonsFactoryV1(): Promise<{ launches: FactoryLaunch[]; health: HealthSource }> {
  return harvestPonsFactoryAt(PONS_FACTORY_V1, "Pons factory V1");
}

export async function harvestPonsFactoryV2(): Promise<{ launches: FactoryLaunch[]; health: HealthSource }> {
  return harvestPonsFactoryAt(PONS_FACTORY_V2, "Pons factory V2");
}

/** @deprecated use harvestPonsFactoryV2 */
export async function harvestPonsFactory(): Promise<{ launches: FactoryLaunch[]; health: HealthSource }> {
  return harvestPonsFactoryV2();
}

async function harvestPonsBitquery(key: string, name: string): Promise<{ launches: FactoryLaunch[]; health: HealthSource }> {
  const t0 = Date.now();
  try {
    const q = "query { EVM(network: eth, dataset: combined) { Events(where: {Log: {SmartContract: {is: \"" + PONS_FACTORY_V2 + "\"}, Signature: {SignatureHash: {is: \"" + TOKEN_LAUNCHED_TOPIC0 + "\"}}}} limit: {count: 50}) { Log { Topics } Transaction { Hash } Block { Number Time } } } }";
    const res = await fetch("https://streaming.bitquery.io/graphql", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({ query: q }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error("Bitquery HTTP " + res.status);
    return { launches: [], health: { name, ok: true, hits: 1, attempts: 1, ms: Date.now() - t0, detail: "bitquery (no RH network — empty)" } };
  } catch (err) {
    return { launches: [], health: fail(name, err, t0) };
  }
}

export async function harvestO1Factory(): Promise<{ launches: FactoryLaunch[]; health: HealthSource }> {
  const rpcUrl = process.env.BASE_RPC_URL;
  if (!rpcUrl) {
    return { launches: [], health: miss("o1 factory fallback", "not wired") };
  }
  const t0 = Date.now();
  try {
    const headHex = await rpc<string>(rpcUrl, "eth_blockNumber", [], "o1 factory fallback");
    const head = Number.parseInt(headHex, 16);
    const from = Math.max(0, head - 600);
    const logs = await rpc<RpcLog[]>(rpcUrl, "eth_getLogs", [{
      address: O1_BASE_FACTORY,
      fromBlock: "0x" + from.toString(16),
      toBlock: "0x" + head.toString(16),
      topics: [O1_LAUNCHED_TOPIC0],
    }], "o1 factory fallback");
    const launches = (logs || []).map((l) => parseO1Log(l, O1_BASE_FACTORY)).filter((x): x is FactoryLaunch => !!x);
    const now = Date.now();
    for (const l of launches) {
      if (l.blockNumber && head) l.timestampMs = now - (head - l.blockNumber) * 2000;
    }
    return { launches, health: { name: "o1 factory fallback", ok: true, hits: 1, attempts: 1, ms: Date.now() - t0, detail: launches.length + " launches" } };
  } catch (err) {
    return { launches: [], health: fail("o1 factory fallback", err, t0) };
  }
}

export { isPonsFactory, isO1Factory };
