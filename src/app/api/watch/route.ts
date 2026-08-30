import { NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/server/auth";
import { parseWatchJson, type WatchFileV1 } from "@/lib/line/watch";
import fs from "fs";
import path from "path";

const WATCH_FILE = path.join("/tmp", "line-watch-admin.json");

export const dynamic = "force-dynamic";

function readServerWatch(): WatchFileV1 {
  try {
    const raw = fs.readFileSync(WATCH_FILE, "utf8");
    return parseWatchJson(raw);
  } catch {
    return { version: 1, items: [] };
  }
}

function writeServerWatch(watch: WatchFileV1) {
  try {
    fs.writeFileSync(WATCH_FILE, JSON.stringify(watch));
  } catch {
    /* disk */
  }
}

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  return await verifySession(token);
}

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const watch = readServerWatch();
  return NextResponse.json(watch);
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const watch = parseWatchJson(JSON.stringify(body));
  writeServerWatch(watch);
  return NextResponse.json({ ok: true });
}
