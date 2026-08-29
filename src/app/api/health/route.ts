import { getSnapshot, listRadar } from "@/lib/server/radar";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const snap = getSnapshot();
  const live = snap ?? (await listRadar());
  const sources = (live.health?.sources || []).map((s) => ({
    name: s.name,
    ok: s.ok,
    hits: s.hits,
    attempts: s.attempts,
    ms: s.ms,
  }));
  return NextResponse.json({
    ok: !live.stale,
    stale: live.stale,
    lastSuccessAt: live.lastSuccessAt,
    fetchedAt: live.fetchedAt,
    sources,
  });
}
