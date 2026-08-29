import { NextResponse } from "next/server";
import {
  applySessionCookie,
  clientIp,
  credentialsMatch,
  isAdminConfigured,
  signSession,
} from "@/lib/server/auth";
import { clearLoginFails, loginBlocked, recordLoginFail } from "@/lib/server/loginLimit";

export const dynamic = "force-dynamic";

function fail(): NextResponse {
  return NextResponse.json({ ok: false, error: "invalid credentials" }, { status: 401 });
}

export async function POST(req: Request) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const ip = clientIp(req);
  if (loginBlocked(ip)) return fail();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    recordLoginFail(ip);
    return fail();
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const username = typeof o.username === "string" ? o.username : "";
  const password = typeof o.password === "string" ? o.password : "";
  const match = await credentialsMatch(username, password);
  if (!match) {
    recordLoginFail(ip);
    return fail();
  }
  const token = await signSession();
  if (!token) return fail();
  clearLoginFails(ip);
  const res = NextResponse.json({ ok: true });
  applySessionCookie(res, req, token);
  return res;
}
