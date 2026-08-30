import { getSnapshot, listRadar } from "@/lib/server/radar";
import { parseAgeGateParam, parseEarlyParam, parsePadParam } from "@/lib/line/radarPath";
import { parseWatchedQuery } from "@/lib/line/watch";
import { attachTelegramHealth } from "@/lib/server/telegram";
import { attachPayboxHealth } from "@/lib/server/paybox";
import { harvestPonsGraduatedCatalog } from "@/lib/server/pons";
import { fetchO1LaunchApi } from "@/lib/server/o1";
import { candToRow } from "@/lib/server/classify";
import { riskFromFlags } from "@/lib/line/risk";
import { heatScore } from "@/lib/line/heat";
import { inferLane } from "@/lib/line/lane";
import type { TokenRow, HealthSource } from "@/lib/line/types";
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
    const snap = getSnapshot();
    if (snap && snap.tokens.length) {
      return NextResponse.json({ 
        ...snap, 
        stale: true,
        on_curve: 0,
        health: attachPayboxHealth(attachTelegramHealth(snap.health))
      });
    }
    
    // Last resort: build minimal rows from pons catalog + o1 cache
    try {
      const now = Date.now();
      const sources: HealthSource[] = [];
      const [ponsCat, o1Base, o1Rh] = await Promise.all([
        harvestPonsGraduatedCatalog(),
        fetchO1LaunchApi(8453),
        fetchO1LaunchApi(4663),
      ]);
      sources.push(ponsCat.health, o1Base.health, o1Rh.health);
      
      const tokens: TokenRow[] = [];
      for (const l of [...ponsCat.launches, ...o1Base.launches, ...o1Rh.launches]) {
        const row = candToRow({
          chain: l.chain,
          ca: l.token,
          sources: new Set([l.pad === "PONS" ? "pons:catalog" : "o1:api"]),
          factory: l,
        }, now);
        if (row) {
          row.risk = riskFromFlags([], row.liqUsd, row.mcapUsd);
          row.heat = heatScore({
            ageSec: row.ageSec,
            buyPct: row.buyPct,
            vol1hUsd: row.vol1hUsd,
            mcapUsd: row.mcapUsd,
            liqUsd: row.liqUsd,
            moving: row.moving,
            curveFillPct: row.pad === "O1" ? undefined : row.curveFillPct,
            inTaxWindow: row.stage === "ANTI_SNIPE",
            sameNameCopies: 0,
            riskLevel: row.risk.level,
            pad: row.pad,
          });
          row.lane = inferLane({
            pad: row.pad,
            stage: row.stage,
            ageSec: row.ageSec,
            curveFillPct: row.pad === "O1" ? undefined : row.curveFillPct,
            printing: false,
            factoryOnly: false,
            vol1hUsd: row.vol1hUsd,
            moving: row.moving,
            padSub: row.padSub,
            liqUsd: row.liqUsd,
          });
          tokens.push(row);
        }
      }
      
      const health = attachPayboxHealth(attachTelegramHealth({
        sources,
        hits: sources.filter(s => s.ok).length,
        attempts: sources.length,
      }));
      
      return NextResponse.json({
        tokens,
        stale: true,
        lastSuccessAt: sources.some(s => s.ok) ? new Date().toISOString() : null,
        fetchedAt: new Date().toISOString(),
        banners: { factoryBeforeDex: 0, mergedFromSnapshot: 0, staleAgoSec: null, sameNameCopiesHidden: 0, hiddenUnderAge: 0 },
        on_curve: 0,
        health,
      });
    } catch {
      // Ultimate fallback
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
}
