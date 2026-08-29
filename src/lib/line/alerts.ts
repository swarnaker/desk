import { formatUsd } from "./format";

/** One browser toast per watched CA per 5 minutes. */
export const TOAST_COOLDOWN_MS = 5 * 60 * 1000;
export const TOAST_SEEN_KEY = "line.runner.alerts.v1";

export type BirthWake = "BIRTH" | "WAKE";

export function watchToastTitle(symbol: string, kind: BirthWake): string {
  return "LINE · " + symbol + " · " + kind;
}

export function watchToastBody(pad: string, mcapUsd?: number | null, vol1hUsd?: number | null): string {
  return pad + " · " + formatUsd(mcapUsd) + " · " + formatUsd(vol1hUsd);
}

export function watchToastHref(chain: string, ca: string): string {
  return "/t/" + chain + "/" + ca;
}

/** Telegram / notify body. Same title+body as the browser toast, plus CA and desk path. */
export function telegramWatchText(opts: {
  symbol: string;
  kind: BirthWake;
  pad: string;
  mcapUsd?: number | null;
  vol1hUsd?: number | null;
  chain: string;
  ca: string;
}): string {
  return [
    watchToastTitle(opts.symbol, opts.kind),
    watchToastBody(opts.pad, opts.mcapUsd, opts.vol1hUsd),
    opts.ca,
    watchToastHref(opts.chain, opts.ca),
  ].join("\n");
}

export function toastDedupeOk(
  seen: Record<string, number>,
  caId: string,
  now: number,
  cooldownMs: number = TOAST_COOLDOWN_MS,
): boolean {
  const last = seen[caId];
  return last == null || now - last >= cooldownMs;
}

/** false→true BIRTH/WAKE. Missing prev counts as not-set (used after the seed snapshot). */
export function birthWakeFlip(
  prev: { birth?: boolean; wake?: boolean } | undefined,
  next: { birth?: boolean; wake?: boolean },
): BirthWake | null {
  if (next.birth && !prev?.birth) return "BIRTH";
  if (next.wake && !prev?.wake) return "WAKE";
  return null;
}

export type ToastHandle = { onclick: ((ev?: unknown) => unknown) | null };

/**
 * Fire a LINE BIRTH/WAKE toast if permission is granted and the CA is off cooldown.
 * Denied/default: no toast, no permission request (caller may ask once elsewhere).
 * Returns true only when a toast is attempted. Marks the CA in `seen` on fire.
 */
export function fireWatchToast(opts: {
  symbol: string;
  kind: BirthWake;
  pad: string;
  mcapUsd?: number | null;
  vol1hUsd?: number | null;
  chain: string;
  ca: string;
  permission: string;
  seen: Record<string, number>;
  now?: number;
  cooldownMs?: number;
  createNotification?: (title: string, options: { body: string; silent: boolean }) => ToastHandle;
  open?: (href: string) => void;
}): boolean {
  const now = opts.now ?? Date.now();
  const caId = (opts.chain + ":" + opts.ca).toLowerCase();
  const cooldown = opts.cooldownMs ?? TOAST_COOLDOWN_MS;
  if (!toastDedupeOk(opts.seen, caId, now, cooldown)) return false;
  if (opts.permission !== "granted") return false;
  const title = watchToastTitle(opts.symbol, opts.kind);
  const body = watchToastBody(opts.pad, opts.mcapUsd, opts.vol1hUsd);
  const href = watchToastHref(opts.chain, opts.ca);
  opts.seen[caId] = now;
  try {
    const n = opts.createNotification?.(title, { body, silent: true });
    if (n) n.onclick = () => { opts.open?.(href); };
  } catch {
    /* Notification blocked after grant */
  }
  return true;
}
