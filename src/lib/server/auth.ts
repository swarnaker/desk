import { NextResponse } from "next/server";

export const COOKIE_NAME = "line_admin";
export const SESSION_DAYS = 7;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const DERIVE_SALT = "line-session-v1";

export function isAdminConfigured(): boolean {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASSWORD;
  return typeof user === "string" && user.length > 0 && typeof pass === "string" && pass.length > 0;
}

export function requestIsHttps(req: Request): boolean {
  const xf = (req.headers.get("x-forwarded-proto") || "").split(",")[0].trim().toLowerCase();
  if (xf === "https") return true;
  if (xf === "http") return false;
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlToBytes(s: string): Uint8Array | null {
  try {
    const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function xorEq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a[i] ^ b[i];
  return out === 0;
}

async function hmac(keyBytes: Uint8Array, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

async function sha256(data: string): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return new Uint8Array(buf);
}

/** HMAC key derived server-side from the admin password env. No extra user-facing env. */
async function sessionKey(): Promise<Uint8Array | null> {
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) return null;
  const saltKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(DERIVE_SALT),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const raw = await crypto.subtle.sign("HMAC", saltKey, new TextEncoder().encode(pass));
  return new Uint8Array(raw);
}

export async function timingSafeEqualStr(a: string, b: string): Promise<boolean> {
  const ha = await sha256(a);
  const hb = await sha256(b);
  return xorEq(ha, hb);
}

export async function credentialsMatch(username: string, password: string): Promise<boolean> {
  const expectUser = process.env.ADMIN_USER || "";
  const expectPass = process.env.ADMIN_PASSWORD || "";
  const userOk = await timingSafeEqualStr(username, expectUser);
  const passOk = await timingSafeEqualStr(password, expectPass);
  return userOk && passOk && isAdminConfigured();
}

export async function signSession(): Promise<string | null> {
  if (!isAdminConfigured()) return null;
  const key = await sessionKey();
  if (!key) return null;
  const exp = Date.now() + SESSION_MS;
  const payload = "v1." + String(exp);
  const sig = await hmac(key, payload);
  return payload + "." + b64url(sig);
}

export async function verifySession(token: string | undefined | null): Promise<boolean> {
  if (!isAdminConfigured()) return false;
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [ver, expRaw, sigB64] = parts;
  if (ver !== "v1") return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp <= Date.now()) return false;
  const sig = b64urlToBytes(sigB64);
  if (!sig) return false;
  const key = await sessionKey();
  if (!key) return false;
  const expect = await hmac(key, ver + "." + expRaw);
  return xorEq(sig, expect);
}

export function sessionCookieOptions(req: Request): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: requestIsHttps(req),
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}

export function applySessionCookie(res: NextResponse, req: Request, token: string): void {
  res.cookies.set({ name: COOKIE_NAME, value: token, ...sessionCookieOptions(req) });
}

export function clearSessionCookie(res: NextResponse, req: Request): void {
  res.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: requestIsHttps(req),
    path: "/",
    maxAge: 0,
  });
}

export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) {
    const first = xf.split(",")[0].trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real && real.trim()) return real.trim();
  return "unknown";
}
