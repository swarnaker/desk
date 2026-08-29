/** Copied hint duration on radar CA cell and desk CA. */
export const COPIED_HINT_MS = 1000;

function execCopy(text: string): boolean {
  if (typeof document === "undefined") return false;
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "0";
  ta.style.left = "0";
  ta.style.width = "1px";
  ta.style.height = "1px";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

/** Full CA to clipboard. navigator.clipboard.writeText with execCommand fallback.
 *  Caller must pass the token's real `ca` field, never truncated/ellipsis display. */
export function copyText(ca: string): void {
  const full = String(ca ?? "");
  const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
  if (clip && typeof clip.writeText === "function") {
    void clip.writeText(full).then(() => undefined, () => { execCopy(full); });
    return;
  }
  execCopy(full);
}
