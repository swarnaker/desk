import { getSnapshot } from "@/lib/server/radar";
import { attachPayboxHealth } from "@/lib/server/paybox";
import { harvestPonsGraduatedCatalog } from "@/lib/server/pons";
import { fetchO1LaunchApi } from "@/lib/server/o1";
import type { HealthSource } from "@/lib/line/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function quickHealthProbe(): Promise<{ sources: HealthSource[]; lastSuccessAt: string | null }> {
  const sources: HealthSource[] = [];
  const timeout = new Promise<void>(r => setTimeout(r, 2800));
  const probes = Promise.all([
    harvestPonsGraduatedCatalog().then(r => sources.push(r.health)),
    fetchO1LaunchApi(8453).then(r => sources.push(r.health)),
    fetchO1LaunchApi(4663).then(r => sources.push(r.health)),
  ]);
  await Promise.race([probes, timeout]);
  const anyOk = sources.some(s => s.ok);
  const lastSuccessAt = anyOk ? new Date().toISOString() : null;
  return { sources, lastSuccessAt };
}

export async function GET() {
  const snap = getSnapshot();
  const probe = await quickHealthProbe();
  
  if (probe.sources.length === 0 && snap) {
    const health = attachPayboxHealth(snap.health);
    const sources = (health.sources || []).map((s) => ({
      name: s.name,
      ok: s.ok,
      hits: s.hits,
      attempts: s.attempts,
      ms: s.ms,
      ...(s.name.toLowerCase() === "paybox" ? { detail: "draft only" } : {}),
    }));
    return NextResponse.json({
      ok: !snap.stale,
      stale: snap.stale,
      lastSuccessAt: snap.lastSuccessAt,
      fetchedAt: snap.fetchedAt,
      sources,
    });
  }

  const health = attachPayboxHealth({ sources: probe.sources, hits: probe.sources.filter(s => s.ok).length, attempts: probe.sources.length });
  const sources = (health.sources || []).map((s) => ({
    name: s.name,
    ok: s.ok,
    hits: s.hits,
    attempts: s.attempts,
    ms: s.ms,
    ...(s.name.toLowerCase() === "paybox" ? { detail: "draft only" } : {}),
  }));
  
  const anyOk = sources.some(s => s.ok);
  const lastSuccessAt = probe.lastSuccessAt || snap?.lastSuccessAt || null;
  const stale = !anyOk;

  return NextResponse.json({
    ok: !stale,
    stale,
    lastSuccessAt,
    fetchedAt: new Date().toISOString(),
    sources,
  });
}
