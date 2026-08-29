import type { HealthSource } from "@/lib/line/types";

export class SourceError extends Error {
  source: string;
  status?: number;
  constructor(source: string, message: string, status?: number) {
    super(message);
    this.source = source;
    this.status = status;
  }
}

export async function fetchJson<T>(
  url: string,
  source: string,
  timeoutMs = 12000,
): Promise<{ data: T; health: HealthSource }> {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: "application/json", "user-agent": "line-radar/1.0" },
      cache: "no-store",
    });
    const text = await res.text();
    const ms = Date.now() - t0;
    if (!res.ok) {
      throw new SourceError(source, source + " HTTP " + res.status, res.status);
    }
    const data = JSON.parse(text) as T;
    return { data, health: { name: source, ok: true, hits: 1, attempts: 1, ms } };
  } catch (err) {
    const ms = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    throw Object.assign(new SourceError(source, msg), { health: { name: source, ok: false, hits: 0, attempts: 1, ms, detail: msg } as HealthSource });
  } finally {
    clearTimeout(timer);
  }
}

export function miss(name: string, detail: string): HealthSource {
  return { name, ok: false, hits: 0, attempts: 1, ms: 0, detail };
}

export function fail(name: string, err: unknown, t0: number, attempts = 1): HealthSource {
  const msg = err instanceof Error ? err.message : String(err);
  return { name, ok: false, hits: 0, attempts, ms: Date.now() - t0, detail: msg };
}
