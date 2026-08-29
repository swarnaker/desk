import { listRadar } from "@/lib/server/radar";
import { parseAgeGateParam } from "@/lib/line/radarPath";
import { parseWatchedQuery } from "@/lib/line/watch";
import { attachTelegramHealth } from "@/lib/server/telegram";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ageGate = parseAgeGateParam(url.searchParams.get("age"));
    const curve = url.searchParams.get("curve") === "1";
    const watched = parseWatchedQuery(url.searchParams.get("watched"));
    const data = await listRadar({ ageGate, curve, watched });
    return NextResponse.json({ ...data, health: attachTelegramHealth(data.health) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const health = attachTelegramHealth({
      sources: [{ name: "radar", ok: false, hits: 0, attempts: 1, ms: 0, detail: msg }],
      hits: 0,
      attempts: 1,
    });
    return NextResponse.json(
      {
        tokens: [],
        stale: true,
        lastSuccessAt: null,
        fetchedAt: new Date().toISOString(),
        banners: { factoryBeforeDex: 0, mergedFromSnapshot: 0, staleAgoSec: null, sameNameCopiesHidden: 0, hiddenUnderAge: 0 },
        health,
      },
      { status: 200 },
    );
  }
}
