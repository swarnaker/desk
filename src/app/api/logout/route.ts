import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res, req);
  return res;
}
