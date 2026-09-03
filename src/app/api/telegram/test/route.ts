import { NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/server/auth";
import { sendTelegramMessage } from "@/lib/server/telegram";

export const dynamic = "force-dynamic";

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  return await verifySession(token);
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

  const chatId = String((body as any).chatId || "");
  if (!chatId) {
    return NextResponse.json({ error: "chat ID required" }, { status: 400 });
  }

  const result = await sendTelegramMessage(chatId, "LINE test");

  if (result.ok) {
    return NextResponse.json({ ok: true });
  } else {
    return NextResponse.json({ error: result.detail || "failed" }, { status: 500 });
  }
}
