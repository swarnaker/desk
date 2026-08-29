import { getSnapshot, listRadar } from "@/lib/server/radar";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const snap = getSnapshot();
  if (snap) {
    return NextResponse.json({
      ok: !snap.stale,
      stale: snap.stale,
      lastSuccessAt: snap.lastSuccessAt,
      fetchedAt: snap.fetchedAt,
      tokens: snap.tokens.length,
      health: snap.health,
    });
  }
  const live = await listRadar();
  return NextResponse.json({
    ok: !live.stale,
    stale: live.stale,
    lastSuccessAt: live.lastSuccessAt,
    fetchedAt: live.fetchedAt,
    tokens: live.tokens.length,
    health: live.health,
  });
}
