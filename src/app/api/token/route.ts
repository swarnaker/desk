import { isChain } from "@/lib/line/ca";
import { getToken, resolveSearch } from "@/lib/server/token";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  if (q) {
    const resolved = await resolveSearch(q);
    if (!resolved) return NextResponse.json({ token: null, resolved: null });
    const token = await getToken(resolved.chain, resolved.ca);
    return NextResponse.json({ token, resolved });
  }
  const chain = url.searchParams.get("chain") || "";
  const ca = url.searchParams.get("ca") || "";
  if (!isChain(chain)) return NextResponse.json({ token: null }, { status: 200 });
  const token = await getToken(chain, ca);
  return NextResponse.json({ token });
}
