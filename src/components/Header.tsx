"use client";
import { COPY } from "@/lib/line/constants";
import { parseSearch } from "@/lib/line/ca";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { isSurvived } from "@/lib/line/lane";
import { PONS_MCAP_BOOK_USD, type RadarPayload } from "@/lib/line/types";
import { useWatch } from "@/hooks/useWatch";
import { useRunnerAlerts } from "@/hooks/useRunnerAlerts";

function useRadar(enabled: boolean) {
  return useQuery({
    queryKey: ["radar"],
    queryFn: async () => {
      const res = await fetch("/api/radar", { cache: "no-store" });
      if (!res.ok) return null;
      return (await res.json()) as RadarPayload;
    },
    enabled,
    refetchInterval: 20_000,
  });
}

export function Header({ signedIn = false }: { signedIn?: boolean }) {
  async function onLogout() {
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch { /* still leave */ }
    window.location.href = "/login";
  }

  const path = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { data } = useRadar(signedIn && path !== "/login");
  const watch = useWatch();
  useRunnerAlerts(data ?? undefined, watch.ids, watch.file.items.length);
  const tokens = data?.tokens || [];
  const pons = tokens.filter((t) => t.pad === "PONS" && isSurvived(t) && (t.mcapUsd ?? 0) >= PONS_MCAP_BOOK_USD).length;
  const o1 = tokens.filter((t) => t.pad === "O1" && isSurvived(t) && (t.mcapUsd ?? 0) >= PONS_MCAP_BOOK_USD).length;
  const live = data && !data.stale;
  const copiesHidden = data?.banners?.sameNameCopiesHidden ?? 0;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const el = e.target as HTMLElement | null;
      if (!el) return;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function deskHref(raw: string): string | null {
    const s = raw.trim();
    if (!s) return null;
    const parsed = parseSearch(s);
    if (parsed.kind === "invalid") return "/t/unknown/" + encodeURIComponent(s);
    if (parsed.kind === "sol") return "/t/solana/" + parsed.ca;
    return "/t/robinhood/" + parsed.ca;
  }

  async function go(raw: string) {
    const parsed = parseSearch(raw.trim());
    if (parsed.kind === "evm") {
      try {
        const res = await fetch("/api/resolve?q=" + encodeURIComponent(parsed.ca), { cache: "no-store" });
        const json = (await res.json()) as { chain?: string | null; ca?: string | null };
        if (json.chain && json.ca) {
          router.push("/t/" + json.chain + "/" + json.ca);
          return;
        }
      } catch {
        /* still navigate */
      }
    }
    const href = deskHref(raw);
    if (!href) return;
    router.push(href);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const raw = inputRef.current?.value ?? q;
    void go(raw);
  }

  const nav = [
    { href: "/", label: "RADAR" },
    { href: "/tape", label: "TAPE" },
    { href: "/whales", label: "WHALES" },
    { href: "/account", label: "ACCOUNT" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-[0.2em] text-gold">LINE</span>
          <span className={"h-2 w-2 rounded-full bg-live " + (live ? "live-dot" : "opacity-30")} />
        </Link>
        <nav className="flex items-center gap-1 text-[11px] tracking-[0.18em] text-mute">
          {nav.map((n, i) => (
            <span key={n.href} className="flex items-center gap-1">
              {i > 0 ? <span className="text-hairline">|</span> : null}
              <Link href={n.href} className={path === n.href ? "text-ink" : "hover:text-ink"}>{n.label}</Link>
            </span>
          ))}
        </nav>
        <form onSubmit={onSubmit} className="flex min-w-[220px] flex-1 items-center gap-2">
          <input
            ref={inputRef}
            id="line-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={COPY.searchPh}
            className="w-full border border-hairline bg-surface px-3 py-1.5 font-mono text-xs text-ink outline-none placeholder:text-mute focus:border-gold"
          />
          <button type="submit" className="chip chip-on shrink-0 tracking-[0.14em]">Search</button>
        </form>
        <div className="font-mono text-xs tabular text-mute">
          Pons {pons} · O1 {o1}
        </div>
      </div>
    </header>
  );
}
