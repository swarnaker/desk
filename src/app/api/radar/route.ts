import { listRadar } from "@/lib/server/radar";
import { parseAgeGateParam, parseEarlyParam, parsePadParam } from "@/lib/line/radarPath";
import { parseWatchedQuery } from "@/lib/line/watch";
import { attachTelegramHealth } from "@/lib/server/telegram";
import { attachPayboxHealth } from "@/lib/server/paybox";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ageGate = parseAgeGateParam(url.searchParams.get("age"));
    const curve = url.searchParams.get("curve") === "1" || url.searchParams.get("on_curve") === "1";
    const watched = parseWatchedQuery(url.searchParams.get("watched"));
    const pad = parsePadParam(url.searchParams.get("pad"));
    const early = parseEarlyParam(url.searchParams.get("early"));
    const data = await listRadar({ ageGate, curve, watched, pad, early });
    return NextResponse.json({ ...data, on_curve: curve ? 1 : 0, health: attachPayboxHealth(attachTelegramHealth(data.health)) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const health = attachPayboxHealth(attachTelegramHealth({
      sources: [{ name: "radar", ok: false, hits: 0, attempts: 1, ms: 0, detail: msg }],
      hits: 0,
      attempts: 1,
    }));
    return NextResponse.json(
      {
        tokens: [],
        stale: true,
        lastSuccessAt: null,
        fetchedAt: new Date().toISOString(),
        banners: { factoryBeforeDex: 0, mergedFromSnapshot: 0, staleAgoSec: null, sameNameCopiesHidden: 0, hiddenUnderAge: 0 },
        on_curve: 0,
        health,
      },
      { status: 200 },
    );
  }
}
