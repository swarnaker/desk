import { getSnapshot } from "@/lib/server/radar";
import { attachPayboxHealth } from "@/lib/server/paybox";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const snap = getSnapshot();
  if (!snap) {
    return NextResponse.json({
      ok: false,
      stale: true,
      lastSuccessAt: null,
      fetchedAt: new Date().toISOString(),
      sources: [],
    });
  }
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
