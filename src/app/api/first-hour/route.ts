import { getSnapshot, listRadar } from "@/lib/server/radar";
import { attachTelegramHealth } from "@/lib/server/telegram";
import { attachPayboxHealth } from "@/lib/server/paybox";
import type { TokenRow, RadarPayload } from "@/lib/line/types";
import { NextResponse } from "next/server";
import { tickerKey } from "@/lib/line/filters";

export const dynamic = "force-dynamic";

const FIRST_HOUR_SEC = 3600;

/**
 * FIRST HOUR: Pons-only bonding curve tokens under 1 hour old.
 * - Show ON_CURVE (TokenLaunched with graduated=false + curveFillPct)
 * - Show just graduated (GRADUATED stage, ageSec < 3600)
 * - Sort by heat descending
 * - Same ticker: one live row (highest heat) + one COPY max
 */
export async function GET(req: Request) {
  try {
    // Fetch all radar data with curve enabled and any age gate
    const data = await listRadar({ 
      ageGate: "any", 
      curve: true, 
      watched: new Set(), 
      pad: "PONS",
      early: false,
      wake: false,
      birth: false
    });

    // Filter for Pons tokens under 1 hour old
    const firstHourTokens = data.tokens.filter((t) => {
      if (t.pad !== "PONS") return false;
      if (t.ageSec == null) return false;
      if (t.ageSec >= FIRST_HOUR_SEC) return false;
      
      // Include ON_CURVE (bonding) tokens
      if (t.stage === "ON_CURVE" && t.curveFillPct != null) return true;
      
      // Include just graduated tokens
      if (t.stage === "GRADUATED") return true;
      
      return false;
    });

    // Sort by heat descending
    const sorted = [...firstHourTokens].sort((a, b) => b.heat - a.heat);

    // Apply same-ticker deduplication: highest heat + watched copies
    const deduped = deduplicateByTicker(sorted);

    const payload: RadarPayload = {
      ...data,
      tokens: deduped,
      banners: {
        factoryBeforeDex: 0,
        mergedFromSnapshot: 0,
        staleAgoSec: data.stale && data.lastSuccessAt ? Math.floor((Date.now() - new Date(data.lastSuccessAt).getTime()) / 1000) : null,
        sameNameCopiesHidden: sorted.length - deduped.length,
        hiddenUnderAge: 0,
      },
    };

    return NextResponse.json({
      ...payload,
      health: attachPayboxHealth(attachTelegramHealth(data.health)),
    });
  } catch (err) {
    const snap = getSnapshot();
    if (snap && snap.tokens.length) {
      const filtered = snap.tokens.filter((t) => 
        t.pad === "PONS" && 
        t.ageSec != null && 
        t.ageSec < FIRST_HOUR_SEC &&
        (t.stage === "ON_CURVE" || t.stage === "GRADUATED")
      );
      
      return NextResponse.json({
        ...snap,
        tokens: filtered,
        stale: true,
        health: attachPayboxHealth(attachTelegramHealth(snap.health)),
      });
    }

    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        tokens: [],
        stale: true,
        lastSuccessAt: null,
        fetchedAt: new Date().toISOString(),
        banners: { factoryBeforeDex: 0, mergedFromSnapshot: 0, staleAgoSec: null, sameNameCopiesHidden: 0, hiddenUnderAge: 0 },
        health: attachPayboxHealth(attachTelegramHealth({
          sources: [{ name: "first-hour", ok: false, hits: 0, attempts: 1, ms: 0, detail: msg }],
          hits: 0,
          attempts: 1,
        })),
      },
      { status: 200 },
    );
  }
}

/**
 * Deduplicate by ticker: keep highest heat per ticker + one COPY max.
 * No watched bypass here - pure signal display.
 */
function deduplicateByTicker(rows: TokenRow[]): TokenRow[] {
  const by = new Map<string, TokenRow[]>();
  
  for (const r of rows) {
    const k = tickerKey(r.symbol) || r.id;
    const arr = by.get(k) || [];
    arr.push(r);
    by.set(k, arr);
  }

  const keep: TokenRow[] = [];
  
  for (const arr of by.values()) {
    if (arr.length === 1) {
      keep.push(arr[0]);
      continue;
    }
    
    // Sort by heat descending
    const sorted = [...arr].sort((a, b) => b.heat - a.heat);
    
    // Keep highest heat (live row)
    keep.push(sorted[0]);
    
    // Keep one COPY max (second highest heat)
    if (sorted.length > 1) {
      const copy = sorted[1];
      copy.canonical = false;
      keep.push(copy);
    }
  }
  
  return keep;
}
