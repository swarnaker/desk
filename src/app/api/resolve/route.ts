import { resolveSearch } from "@/lib/server/token";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") || "";
  const resolved = await resolveSearch(q);
  if (!resolved) return NextResponse.json({ chain: null, ca: null, resolved: null });
  return NextResponse.json({ chain: resolved.chain, ca: resolved.ca, resolved });
}
