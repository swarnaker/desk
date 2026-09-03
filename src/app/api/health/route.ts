import { getSnapshot } from "@/lib/server/radar";
import { attachPayboxHealth } from "@/lib/server/paybox";
import { harvestPonsGraduatedCatalog } from "@/lib/server/pons";
import { fetchO1LaunchApi } from "@/lib/server/o1";
import { telegramHealth } from "@/lib/server/telegram";
import type { HealthSource } from "@/lib/line/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type ProbeResult = { name: string; health: HealthSource };

async function timeoutWrapper<T>(
  promise: Promise<T>,
  timeoutMs: number,
  name: string
): Promise<{ ok: boolean; result?: T }> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), timeoutMs)
  );
  try {
    const result = await Promise.race([promise, timeout]);
    return { ok: true, result };
  } catch {
    return { ok: false };
  }
}

async function quickHealthProbe(): Promise<{ sources: HealthSource[]; lastSuccessAt: string | null }> {
  const probes = [
    timeoutWrapper(harvestPonsGraduatedCatalog(), 4000, "pons catalog").then(r => ({
      name: "pons catalog",
      health: r.ok && r.result ? r.result.health : { name: "Pons graduated catalog", ok: false, hits: 0, attempts: 1, ms: 4000, detail: "timeout" } as HealthSource
    })),
    timeoutWrapper(fetchO1LaunchApi(8453), 4000, "o1 base").then(r => ({
      name: "o1 base",
      health: r.ok && r.result ? r.result.health : { name: "o1 launch API chain 8453", ok: false, hits: 0, attempts: 1, ms: 4000, detail: "timeout" } as HealthSource
    })),
    timeoutWrapper(fetchO1LaunchApi(4663), 4000, "o1 rh").then(r => ({
      name: "o1 rh",
      health: r.ok && r.result ? r.result.health : { name: "o1 launch API chain 4663", ok: false, hits: 0, attempts: 1, ms: 4000, detail: "timeout" } as HealthSource
    })),
  ];

  const wallTimeout = new Promise<ProbeResult[]>(resolve =>
    setTimeout(() => resolve([]), 2800)
  );
  const settled = Promise.allSettled(probes).then(results =>
    results.map(r => r.status === "fulfilled" ? r.value : null).filter((x): x is ProbeResult => x !== null)
  );

  const completed = await Promise.race([settled, wallTimeout]);
  
  const sources: HealthSource[] = [];
  const seeded = new Set<string>();
  
  for (const item of completed) {
    sources.push(item.health);
    seeded.add(item.name);
  }
  
  if (!seeded.has("pons catalog")) {
    sources.push({ name: "Pons graduated catalog", ok: false, hits: 0, attempts: 1, ms: 2800, detail: "wall timeout" });
  }
  if (!seeded.has("o1 base")) {
    sources.push({ name: "o1 launch API chain 8453", ok: false, hits: 0, attempts: 1, ms: 2800, detail: "wall timeout" });
  }
  if (!seeded.has("o1 rh")) {
    sources.push({ name: "o1 launch API chain 4663", ok: false, hits: 0, attempts: 1, ms: 2800, detail: "wall timeout" });
  }

  const anyOk = sources.some(s => s.ok);
  const lastSuccessAt = anyOk ? new Date().toISOString() : null;
  return { sources, lastSuccessAt };
}

export async function GET() {
  const snap = getSnapshot();
  const probe = await quickHealthProbe();

  const health = attachPayboxHealth({
    sources: probe.sources,
    hits: probe.sources.filter(s => s.ok).length,
    attempts: probe.sources.length
  });

  const tgHealth = telegramHealth();
  
  const sources = [...(health.sources || []), tgHealth].map((s) => ({
    name: s.name,
    ok: s.ok,
    hits: s.hits,
    attempts: s.attempts,
    ms: s.ms,
    ...(s.name.toLowerCase() === "paybox" ? { detail: "draft only" } : {}),
    ...(s.detail ? { detail: s.detail } : {}),
  }));

  const anyOk = sources.some(s => s.ok && s.name !== "PayBox");
  const lastSuccessAt = anyOk
    ? new Date().toISOString()
    : snap?.lastSuccessAt || null;
  const stale = !anyOk;

  return NextResponse.json({
    ok: !stale,
    stale,
    lastSuccessAt,
    fetchedAt: new Date().toISOString(),
    sources,
  });
}
