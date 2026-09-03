import { NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/server/auth";
import fs from "fs";
import path from "path";
import type { TelegramSettings } from "@/lib/server/telegram";

const SETTINGS_FILE = path.join("/tmp", "line-settings-admin.json");

export const dynamic = "force-dynamic";

function readSettings(): TelegramSettings {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      chatId: String(parsed.chatId || ""),
    };
  } catch {
    return { chatId: "" };
  }
}

function writeSettings(settings: TelegramSettings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings));
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
  const settings = readSettings();
  return NextResponse.json(settings);
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
  
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const settings: TelegramSettings = {
    chatId: String((body as any).chatId || ""),
  };

  writeSettings(settings);
  return NextResponse.json({ ok: true });
}
