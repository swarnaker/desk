"use client";
import { COPY } from "@/lib/line/constants";
import { hiddenUnderLabel, radarApiPath } from "@/lib/line/radarPath";
import type { RadarPayload } from "@/lib/line/types";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useWatch } from "@/hooks/useWatch";
import { HealthFooter } from "@/components/HealthFooter";

export default function AccountPage() {
  const watch = useWatch();
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

      <HealthFooter signedIn={true} page="account" />
    </div>
  );
}
