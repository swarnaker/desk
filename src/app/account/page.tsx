"use client";
import { COPY } from "@/lib/line/constants";
import { hiddenUnderLabel, radarApiPath } from "@/lib/line/radarPath";
import type { RadarPayload } from "@/lib/line/types";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useWatch } from "@/hooks/useWatch";
import { HealthFooter } from "@/components/HealthFooter";
import { useRadarFilters } from "@/hooks/useRadarFilters";
import { LINE_EARLY_CHIP } from "@/lib/line/uiLabels";

function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={"chip " + (on ? "chip-on" : "hover:text-ink")}>
      {children}
    </button>
  );
}

export default function AccountPage() {
  const watch = useWatch();
  const { filters, setFilters } = useRadarFilters();
  const watchedIds = watch.file.items.map((i) => i.chain + ":" + i.ca);
  
  const { data } = useQuery({
    queryKey: ["radar", "6h", false, watchedIds.join(","), "BOTH", false],
    queryFn: async () => {
      const res = await fetch(radarApiPath("6h", false, watchedIds, "BOTH", false), { cache: "no-store" });
      if (!res.ok) return null;
      return (await res.json()) as RadarPayload;
    },
    refetchInterval: 20_000,
  });

  async function onLogout() {
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch { /* still leave */ }
    window.location.href = "/login";
  }

  const b = data?.banners;
  const hiddenLabel = hiddenUnderLabel("6h");
  const hiddenN = b?.hiddenUnderAge ?? 0;
  const copiesHidden = data?.banners?.sameNameCopiesHidden ?? 0;
  
  const set = (p: Partial<typeof filters>) => setFilters({ ...filters, ...p });

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center gap-3 font-mono text-xs tracking-[0.18em] text-mute">
        <span>ADMIN</span>
        <span>·</span>
        <button type="button" onClick={() => void onLogout()} className="hover:text-ink">LOGOUT</button>
      </div>

      <div className="flex items-center gap-3">
        <span className="chip chip-on tracking-[0.2em]">{COPY.signal}</span>
        <span className="text-[11px] text-mute">{COPY.never}</span>
      </div>

      <div>
        <div className="text-[11px] tracking-[0.18em] text-gold">{COPY.newNames}</div>
        <h1 className="text-sm tracking-[0.14em] text-ink">{COPY.top}</h1>
        <p className="max-w-3xl text-[11px] text-mute">{COPY.topBody}</p>
      </div>

      <Link href="/docs/wallet-security" className="inline-block text-[11px] text-mute hover:text-gold">
        {COPY.drawdown}
      </Link>

      {b ? (
        <div className="space-y-1 text-[11px] text-gold/90">
          {b.factoryBeforeDex > 0 ? <div>{b.factoryBeforeDex} factory launches shown before Dex indexed a pair.</div> : null}
          {b.mergedFromSnapshot > 0 ? <div>Merged {b.mergedFromSnapshot} Pons/O1/Base rows from previous snapshot.</div> : null}
          <div>{hiddenN} hidden under {hiddenLabel}</div>
          {copiesHidden > 0 ? <div>{copiesHidden} same-name copies hidden</div> : null}
          {data?.stale && b.staleAgoSec != null ? <div>STALE · last success {b.staleAgoSec}s ago</div> : null}
        </div>
      ) : null}

      <div className="font-mono text-xs tabular text-mute">
        Watch {watch.file.items.length}
      </div>

      <div>
        <h2 className="mb-2 text-sm tracking-[0.14em] text-ink">More filters</h2>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <Chip on={filters.pad === "VIRTUALS"} onClick={() => set({ pad: "VIRTUALS" })}>Virtuals</Chip>
          <Chip on={filters.pad === "CLANKER"} onClick={() => set({ pad: "CLANKER" })}>Clanker</Chip>
          <Chip on={filters.pad === "PUMP"} onClick={() => set({ pad: "PUMP" })}>Pump</Chip>
          <Chip on={filters.pad === "LONG"} onClick={() => set({ pad: "LONG" })}>Long</Chip>
          <span className="mx-1 text-hairline">|</span>
          <Chip on={filters.curve} onClick={() => set({ curve: !filters.curve })}>Curve</Chip>
          <Chip on={filters.birthOnly} onClick={() => set({ birthOnly: !filters.birthOnly })}>BIRTH</Chip>
        </div>
        <p className="mt-2 text-[11px] text-mute">These filters work with Radar. Click to apply, then visit Radar to see results.</p>
      </div>

      <HealthFooter signedIn={true} />
    </div>
  );
}
