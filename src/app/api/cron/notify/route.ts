import { NextRequest, NextResponse } from "next/server";
import { getSnapshot } from "@/lib/server/radar";
import { sendTelegramMessage } from "@/lib/server/telegram";
import { computeWake, computePrint } from "@/lib/line/lane";
import type { TokenRow } from "@/lib/line/types";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const SEEN_FILE = path.join("/tmp", "line-telegram-seen.json");
const SEEN_TTL_MS = 6 * 60 * 60 * 1000;

type SeenMap = Record<string, number>;

function readSeen(): SeenMap {
  try {
    const raw = fs.readFileSync(SEEN_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeSeen(seen: SeenMap) {
  try {
    fs.writeFileSync(SEEN_FILE, JSON.stringify(seen));
  } catch {
    /* disk */
  }
}

function cleanupSeen(seen: SeenMap, nowMs: number): SeenMap {
  const out: SeenMap = {};
  for (const [ca, ts] of Object.entries(seen)) {
    if (nowMs - ts < SEEN_TTL_MS) {
      out[ca] = ts;
    }
  }
  return out;
}

const CANONICAL_PINS = new Set([
  "robinhood:0xaec5e474476b6471aa6e6a90ee309c11a28cfbee",
  "base:0x29283c5dc2ce9d0feea789fd6c7e6906eaed34fb",
  "robinhood:0xdc8afca32ba46b12b698e2e4619fe4bb1b8df5a2",
]);

function isCanonicalPin(row: TokenRow): boolean {
  if (CANONICAL_PINS.has(row.id)) return true;
  const sym = row.symbol.toUpperCase().trim().replace(/[\$\s]/g, "");
  return sym === "PONS" || sym === "O" || sym === "AI";
}

function formatMessage(row: TokenRow, status: "WAKE" | "PRINT"): string {
  const heat = String(row.heat);
  const vol1h = row.vol1hUsd != null ? `$${Math.round(row.vol1hUsd).toLocaleString()}` : "—";
  const mcap = row.mcapUsd != null ? `$${Math.round(row.mcapUsd).toLocaleString()}` : "—";
  
  return `$${row.symbol} ${status}  ${heat}  ${vol1h}  ${mcap}\nhttps://www.linespace.space/t/${row.chain}/${row.ca}`;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("x-cron-secret");
    if (header !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const snap = getSnapshot();
  if (!snap || snap.tokens.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, detail: "no snapshot" });
  }

  let chatIdValue = process.env.TELEGRAM_CHAT_ID || "";
  
  try {
    const settingsPath = path.join("/tmp", "line-settings-admin.json");
    const raw = fs.readFileSync(settingsPath, "utf8");
    const settings = JSON.parse(raw);
    if (settings.chatId) {
      chatIdValue = String(settings.chatId);
    }
  } catch {
    /* use env fallback */
  }

  if (!chatIdValue) {
    return NextResponse.json({ ok: true, sent: 0, detail: "no chat ID" });
  }

  const nowMs = Date.now();
  let seen = readSeen();
  seen = cleanupSeen(seen, nowMs);

  const candidates = snap.tokens.filter(row => {
    if (isCanonicalPin(row)) return false;
    if (row.pad !== "PONS" && row.pad !== "O1") return false;
    if (seen[row.ca]) return false;
    return computeWake(row) || computePrint(row);
  });

  let sent = 0;
  for (const row of candidates) {
    const status = computeWake(row) ? "WAKE" : "PRINT";
    const message = formatMessage(row, status);
    const result = await sendTelegramMessage(chatIdValue, message);
    
    if (result.ok) {
      seen[row.ca] = nowMs;
      sent++;
    }
  }

  writeSeen(seen);

  return NextResponse.json({ ok: true, sent, total: candidates.length });
}
