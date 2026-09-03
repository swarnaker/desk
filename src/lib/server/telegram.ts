import fs from "fs";
import path from "path";
import { isChain, isEvmCa, isSolMint, normalizeCa } from "@/lib/line/ca";
import { telegramWatchText, toastDedupeOk, TOAST_COOLDOWN_MS, type BirthWake } from "@/lib/line/alerts";
import type { HealthSource } from "@/lib/line/types";

const SEEN_PATH = path.join(process.cwd(), "data", "notify-seen.json");

function token(): string {
  return (process.env.TELEGRAM_BOT_TOKEN || "").trim();
}

function chatId(): string {
  return (process.env.TELEGRAM_CHAT_ID || "").trim();
}

export type TelegramSettings = {
  chatId: string;
};

function getChatId(): string {
  try {
    const settingsPath = path.join("/tmp", "line-settings-admin.json");
    const raw = fs.readFileSync(settingsPath, "utf8");
    const settings = JSON.parse(raw);
    if (settings.chatId) {
      return String(settings.chatId);
    }
  } catch {
    /* use env fallback */
  }
  return chatId();
}

export function telegramWired(): boolean {
  return !!(token() && chatId());
}

export async function sendTelegramMessage(
  chatIdParam: string,
  message: string
): Promise<{ ok: boolean; detail?: string }> {
  const t = token();
  if (!t) {
    return { ok: false, detail: "not wired" };
  }

  try {
    const url = `https://api.telegram.org/bot${t}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatIdParam,
        text: message,
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "network error");
      return { ok: false, detail: err.slice(0, 100) };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, detail: String(err).slice(0, 100) };
  }
}

export function telegramHealth(): HealthSource {
  const wired = telegramWired();
  return {
    name: "telegram",
    ok: wired,
    hits: wired ? 1 : 0,
    attempts: 1,
    ms: 0,
    detail: wired ? undefined : "not wired",
  };
}

export function getTelegramHealth(): HealthSource {
  return telegramHealth();
}

export function attachTelegramHealth(health?: {
  sources?: HealthSource[];
  hits?: number;
  attempts?: number;
} | null): { sources: HealthSource[]; hits: number; attempts: number } {
  const tg = telegramHealth();
  const sources = (health?.sources ?? []).filter((s) => (s.name || "").toLowerCase() !== "telegram");
  sources.push(tg);
  return {
    sources,
    hits: (health?.hits ?? 0) + tg.hits,
    attempts: (health?.attempts ?? 0) + tg.attempts,
  };
}

let mem: Record<string, number> | null = null;

function loadSeen(): Record<string, number> {
  if (mem) return mem;
  try {
    const raw = fs.readFileSync(SEEN_PATH, "utf8");
    const parsed = JSON.parse(raw) as Record<string, number>;
    mem = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    mem = {};
  }
  return mem;
}

function saveSeen(seen: Record<string, number>) {
  mem = seen;
  try {
    fs.mkdirSync(path.dirname(SEEN_PATH), { recursive: true });
    fs.writeFileSync(SEEN_PATH, JSON.stringify(seen));
  } catch {
    /* disk */
  }
}

export type NotifyInput = {
  chain: string;
  ca: string;
  symbol: string;
  pad: string;
  mcap?: number | null;
  vol1h?: number | null;
  kind: BirthWake;
};

export async function notifyWatch(input: NotifyInput): Promise<{ ok: boolean; detail: string }> {
  if (!telegramWired()) return { ok: false, detail: "not wired" };
  if (input.kind !== "BIRTH" && input.kind !== "WAKE") return { ok: false, detail: "invalid" };
  if (!isChain(input.chain)) return { ok: false, detail: "invalid" };
  const ca = (input.ca || "").trim();
  const valid = input.chain === "solana" ? isSolMint(ca) : isEvmCa(ca);
  if (!valid) return { ok: false, detail: "invalid" };
  const nca = normalizeCa(input.chain, ca);
  const caId = (input.chain + ":" + nca).toLowerCase();
  const now = Date.now();
  const seen = loadSeen();
  if (!toastDedupeOk(seen, caId, now, TOAST_COOLDOWN_MS)) {
    return { ok: true, detail: "cooldown" };
  }
  seen[caId] = now;
  saveSeen(seen);

  const t = token();
  const chat = getChatId();
  const text = telegramWatchText({
    symbol: input.symbol || "?",
    kind: input.kind,
    pad: input.pad || "—",
    mcapUsd: input.mcap,
    vol1hUsd: input.vol1h,
    chain: input.chain,
    ca: nca,
  });
  try {
    const res = await fetch("https://api.telegram.org/bot" + t + "/sendMessage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, detail: "send failed" };
    return { ok: true, detail: "sent" };
  } catch {
    return { ok: false, detail: "send failed" };
  }
}
