"use client";
import { birthWakeFlip, fireWatchToast, TOAST_SEEN_KEY, type BirthWake } from "@/lib/line/alerts";
import type { RadarPayload, TokenRow } from "@/lib/line/types";
import { useEffect, useRef } from "react";

function loadSeen(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(TOAST_SEEN_KEY) || "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function saveSeen(seen: Record<string, number>) {
  try {
    localStorage.setItem(TOAST_SEEN_KEY, JSON.stringify(seen));
  } catch { /* quota */ }
}

function permissionNow(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

/** Ask at most once while something is watched. Never re-prompt after deny. */
function requestPermissionOnce(asked: { current: boolean }) {
  if (asked.current) return;
  const p = permissionNow();
  if (p !== "default") return;
  asked.current = true;
  void Notification.requestPermission().catch(() => {});
}

function isWatched(t: TokenRow, ids: Set<string>): boolean {
  return ids.has(t.id.toLowerCase()) || ids.has(t.ca.toLowerCase());
}

function snapshotFlags(tokens: TokenRow[]): Map<string, { birth: boolean; wake: boolean }> {
  const m = new Map<string, { birth: boolean; wake: boolean }>();
  for (const t of tokens) m.set(t.id.toLowerCase(), { birth: !!t.birth, wake: !!t.wake });
  return m;
}

function browserNotify(title: string, options: { body: string; silent: boolean }) {
  return new Notification(title, options) as { onclick: ((ev?: unknown) => unknown) | null };
}

function openDesk(href: string) {
  try { window.focus(); } catch { /* ignore */ }
  window.location.href = href;
}

function postNotify(t: TokenRow, kind: BirthWake) {
  try {
    void fetch("/api/notify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chain: t.chain,
        ca: t.ca,
        symbol: t.symbol,
        pad: t.pad,
        mcap: t.mcapUsd ?? null,
        vol1h: t.vol1hUsd ?? null,
        kind,
      }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Browser toast + optional server Telegram. No sound, no extra chrome. */
export function useRunnerAlerts(
  payload: RadarPayload | undefined,
  watchIds: Set<string>,
  watchCount: number,
) {
  const idsRef = useRef(watchIds);
  idsRef.current = watchIds;
  const prevRef = useRef<Map<string, { birth: boolean; wake: boolean }> | null>(null);
  const askedRef = useRef(false);

  useEffect(() => {
    if (watchCount > 0) requestPermissionOnce(askedRef);
  }, [watchCount]);

  useEffect(() => {
    if (!payload) return;
    const tokens = payload.tokens || [];
    const next = snapshotFlags(tokens);
    const prev = prevRef.current;
    prevRef.current = next;
    // First payload after mount is a seed, not a flip — avoid toasting already-BIRTH rows.
    if (prev == null) return;

    const ids = idsRef.current;
    const perm = permissionNow();
    const now = Date.now();
    const seen = loadSeen();

    for (const t of tokens) {
      if (!isWatched(t, ids)) continue;
      const kind: BirthWake | null = birthWakeFlip(prev.get(t.id.toLowerCase()), t);
      if (!kind) continue;
      fireWatchToast({
        symbol: t.symbol,
        kind,
        pad: t.pad,
        mcapUsd: t.mcapUsd,
        vol1hUsd: t.vol1hUsd,
        chain: t.chain,
        ca: t.ca,
        permission: perm === "unsupported" ? "denied" : perm,
        seen,
        now,
        createNotification: perm === "granted" ? browserNotify : undefined,
        open: openDesk,
      });
      postNotify(t, kind);
    }
    saveSeen(seen);
  }, [payload]);
}
