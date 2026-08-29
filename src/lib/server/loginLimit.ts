const WINDOW_MS = 15 * 60 * 1000;
const MAX_TRIES = 5;

const hits = new Map<string, number[]>();

export function loginBlocked(ip: string): boolean {
  const now = Date.now();
  const keep = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  hits.set(ip, keep);
  return keep.length >= MAX_TRIES;
}

export function recordLoginFail(ip: string): void {
  const now = Date.now();
  const keep = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  keep.push(now);
  hits.set(ip, keep);
}

export function clearLoginFails(ip: string): void {
  hits.delete(ip);
}
