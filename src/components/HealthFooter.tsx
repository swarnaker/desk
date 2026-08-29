"use client";
import { useQuery } from "@tanstack/react-query";
import type { HealthSource, RadarPayload } from "@/lib/line/types";
import { hiddenUnderLabel, radarApiPath } from "@/lib/line/radarPath";
import { useRadarFiltersOptional } from "@/hooks/useRadarFilters";
import { useWatch } from "@/hooks/useWatch";

function findSrc(sources: HealthSource[], ...needles: string[]): HealthSource | undefined {
  return sources.find((s) => {
    const n = s.name.toLowerCase();
    return needles.every((x) => n.includes(x.toLowerCase()));
  });
}

function bit(label: string, s: HealthSource | undefined): string {
  if (!s) return label;
  const core = label + " " + s.hits + "/" + s.attempts;
  return s.ok ? core : core + " (off)";
}

function ago(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return s + "s";
  if (s < 3600) return Math.floor(s / 60) + "m";
  return Math.floor(s / 3600) + "h";
}

export function HealthFooter({ signedIn = false }: { signedIn?: boolean }) {
  const ctx = useRadarFiltersOptional();
  const ageGate = ctx?.filters.ageGate ?? "6h";
  const curve = ctx?.filters.curve ?? false;
  const watch = useWatch();
  const watchedIds = watch.file.items.map((i) => i.chain + ":" + i.ca);
  const { data } = useQuery({
    queryKey: ["radar", ageGate, curve, watchedIds.join(",")],
    queryFn: async () => {
      const res = await fetch(radarApiPath(ageGate, curve, watchedIds), { cache: "no-store" });
      if (!res.ok) return null;
      return (await res.json()) as RadarPayload;
    },
    enabled: signedIn,
    refetchInterval: 20_000,
  });
  const sources = data?.health?.sources ?? [];
  const pump = findSrc(sources, "pumpfun") || findSrc(sources, "DexScreener");
  const catalog = findSrc(sources, "graduated catalog") || findSrc(sources, "pons catalog");
  // Factory line is V1+V2+o1 factory only. Catalog success must not claim factory is on.
  const facs = sources.filter((s) => /factory/i.test(s.name) && !/catalog/i.test(s.name));
  const facHits = facs.reduce((a, s) => a + s.hits, 0);
  const facAtt = facs.reduce((a, s) => a + s.attempts, 0);
  const facOk = facs.some((s) => s.ok);
  const factoryLine = facOk
    ? "factory " + facHits + "/" + Math.max(1, facAtt)
    : "factory 0/1 (off)";
  const hiddenN = data?.banners?.hiddenUnderAge ?? 0;
  const hiddenLabel = hiddenUnderLabel(ageGate);
  const tg = findSrc(sources, "telegram");
  const tgLine = tg?.ok ? "telegram" : "telegram not wired";

  return (
    <footer className="fixed bottom-0 left-0 right-0 border-t border-hairline bg-bg/95 px-3 py-1.5 font-mono text-[11px] tabular text-mute">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2">
        <span>
          {bit("Dex pumpfun", pump)} · {bit("pons catalog", catalog)} · {factoryLine} · {tgLine} · last success {ago(data?.lastSuccessAt)}
        </span>
        <span className="text-[10px]">{data?.stale ? "STALE" : "live"} · {(data?.tokens ?? []).length} rows · {hiddenN} hidden under {hiddenLabel}</span>
      </div>
    </footer>
  );
}
