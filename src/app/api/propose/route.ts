import { isChain, isEvmCa, isSolMint } from "@/lib/line/ca";
import { canPropose } from "@/lib/line/propose";
import { proposePayload } from "@/lib/server/paybox";
import { getToken } from "@/lib/server/token";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function handle(req: Request) {
  const url = new URL(req.url);
  const chain = (url.searchParams.get("chain") || "").trim();
  const ca = decodeURIComponent(url.searchParams.get("ca") || "").trim();
  if (!isChain(chain)) return NextResponse.json({ ok: false }, { status: 404 });
  const valid = chain === "solana" ? isSolMint(ca) : isEvmCa(ca);
  if (!valid) return NextResponse.json({ ok: false }, { status: 404 });
  const token = await getToken(chain, ca);
  if (!token) return NextResponse.json({ ok: false }, { status: 404 });
  if (!canPropose(token).ok) return NextResponse.json({ ok: false }, { status: 400 });
  return NextResponse.json(proposePayload(token));
}

export const GET = handle;
export const POST = handle;
