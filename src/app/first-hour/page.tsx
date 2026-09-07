"use client";
import { FirstHourTable } from "@/components/FirstHourTable";
import type { RadarPayload } from "@/lib/line/types";
import { useQuery } from "@tanstack/react-query";
import { HealthFooter } from "@/components/HealthFooter";

export default function FirstHourPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["first-hour"],
    queryFn: async () => {
      const res = await fetch("/api/first-hour", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch first hour data");
      return (await res.json()) as RadarPayload;
    },
    refetchInterval: 20_000,
  });

  const tokens = data?.tokens || [];
  const copiesHidden = data?.banners?.sameNameCopiesHidden ?? 0;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h1 className="text-sm tracking-[0.14em] text-ink">FIRST HOUR</h1>
        <p className="text-[11px] text-mute">
          Pons bonding curve tokens under 1 hour old. Sorted by heat. Research/signal only.
        </p>
        {copiesHidden > 0 ? (
          <div className="text-[11px] text-gold/90">
            {copiesHidden} same-name copies hidden (one live + one COPY max)
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="text-[11px] text-mute">loading first hour…</div>
      ) : null}
      
      {error ? (
        <div className="text-[11px] text-sell">first hour error</div>
      ) : null}
      
      {!isLoading && data?.stale ? (
        <div className="border border-gold/30 bg-surface px-4 py-2 text-[11px] text-gold/90">
          STALE · using cached data
        </div>
      ) : null}

      <FirstHourTable rows={tokens} />
      
      <HealthFooter signedIn={true} />
    </div>
  );
}
