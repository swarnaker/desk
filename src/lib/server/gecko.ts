import { isEvmCa } from "@/lib/line/ca";
import type { HealthSource } from "@/lib/line/types";
import { fail } from "./http";

export type GeckoPool = { address: string; name?: string; createdAt?: number };

const GECKO_NEW = "https://api.geckoterminal.com/api/v2/networks/base/new_pools?page=1";

export async function fetchGeckoBaseNew(): Promise<{ items: GeckoPool[]; health: HealthSource }> {
  const t0 = Date.now();
  const source = "GeckoTerminal Base new";
  try {
    const res = await fetch(GECKO_NEW, {
      headers: { accept: "application/json", "user-agent": "line-radar/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const ms = Date.now() - t0;
    if (!res.ok) {
      return { items: [], health: { name: source, ok: false, hits: 0, attempts: 1, ms, detail: "HTTP " + res.status } };
    }
    const data = (await res.json()) as {
      data?: Array<{
        attributes?: { name?: string; pool_created_at?: string };
        relationships?: { base_token?: { data?: { id?: string } } };
      }>;
    };
    const items: GeckoPool[] = [];
    for (const row of data.data || []) {
      const id = row.relationships?.base_token?.data?.id || "";
      const addr = id.replace(/^base_/i, "");
      if (!isEvmCa(addr)) continue;
      const createdRaw = row.attributes?.pool_created_at;
      const created = createdRaw ? Date.parse(createdRaw) : NaN;
      items.push({
        address: addr,
        name: (row.attributes?.name || "").split("/")[0]?.trim() || undefined,
        createdAt: Number.isFinite(created) ? created : undefined,
      });
    }
    return { items, health: { name: source, ok: true, hits: 1, attempts: 1, ms, detail: items.length + " pools" } };
  } catch (err) {
    return { items: [], health: fail(source, err, t0) };
  }
}
