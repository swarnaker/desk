import { isChain, isEvmCa, isSolMint } from "@/lib/line/ca";
import { getToken } from "@/lib/server/token";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ chain: string; ca: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { chain, ca: raw } = await ctx.params;
  const ca = decodeURIComponent(raw || "").trim();
  if (!isChain(chain) || chain === "unknown") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  const valid = chain === "solana" ? isSolMint(ca) : isEvmCa(ca);
  if (!valid) return NextResponse.json({ ok: false }, { status: 404 });
  const token = await getToken(chain, ca);
  if (!token) return NextResponse.json({ ok: false }, { status: 404 });
  return NextResponse.json({ ok: true, symbol: token.symbol, token });
}
