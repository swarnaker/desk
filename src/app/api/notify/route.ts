import { isChain, isEvmCa, isSolMint } from "@/lib/line/ca";
import { notifyWatch, notifyTest } from "@/lib/server/telegram";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await notifyTest();
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, detail: "invalid" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, detail: "invalid" }, { status: 400 });
  }
  const o = body as Record<string, unknown>;
  const chain = typeof o.chain === "string" ? o.chain : "";
  const ca = typeof o.ca === "string" ? o.ca.trim() : "";
  const symbol = typeof o.symbol === "string" ? o.symbol : "";
  const pad = typeof o.pad === "string" ? o.pad : "";
  const kind = o.kind === "BIRTH" || o.kind === "WAKE" ? o.kind : null;
  const mcap = typeof o.mcap === "number" && Number.isFinite(o.mcap) ? o.mcap : null;
  const vol1h = typeof o.vol1h === "number" && Number.isFinite(o.vol1h) ? o.vol1h : null;
  if (!kind || !isChain(chain)) {
    return NextResponse.json({ ok: false, detail: "invalid" }, { status: 400 });
  }
  const validCa = chain === "solana" ? isSolMint(ca) : isEvmCa(ca);
  if (!validCa) {
    return NextResponse.json({ ok: false, detail: "invalid" }, { status: 400 });
  }
  const result = await notifyWatch({ chain, ca, symbol, pad, mcap, vol1h, kind });
  return NextResponse.json(result);
}
