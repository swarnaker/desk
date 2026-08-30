"use client";
import { deskOrganicBadge, isRealDeployer } from "@/lib/line/deployer";
import { EM, formatAge, formatPct, formatUsd, shortCa } from "@/lib/line/format";
import { physicsBits } from "@/lib/line/physics";
import { isChain, isEvmCa, isSolMint } from "@/lib/line/ca";
import type { Chain, RadarPayload, TokenClone, TokenRow } from "@/lib/line/types";
import { copyText } from "@/lib/line/copyCa";
import { canPropose, formatProposeDraft, PROPOSE_COOLDOWN_MS } from "@/lib/line/propose";
import { LINE_PROPOSE_LABEL } from "@/lib/line/uiLabels";
import { useWatch } from "@/hooks/useWatch";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CopyCa } from "./CopyCa";

export function TokenDesk() {
  const params = useParams<{ chain: string; ca: string }>();
  const chain = params.chain;
  const ca = decodeURIComponent(params.ca || "");
  const validChain = isChain(chain);
  const validCa = validChain && (chain === "solana" ? isSolMint(ca) : isEvmCa(ca));
  const watch = useWatch();
  const { data, isLoading } = useQuery({
    queryKey: ["token", chain, ca],
    enabled: !!validCa,
    queryFn: async () => {
      const res = await fetch("/api/token/" + chain + "/" + encodeURIComponent(ca), { cache: "no-store" });
      const json = (await res.json()) as { ok?: boolean; token?: TokenRow | null };
      if (!res.ok || json.ok === false) return { token: null };
      return { token: json.token ?? null };
    },
  });
  const radarQ = useQuery({
    queryKey: ["radar"],
    queryFn: async () => (await fetch("/api/radar", { cache: "no-store" })).json() as Promise<RadarPayload>,
    refetchInterval: 20_000,
  });
  if (!validChain || !validCa) {
    return (
      <div className="border border-hairline bg-surface px-6 py-16 text-center">
        <div className="text-sm tracking-[0.2em] text-gold">EMPTY DESK</div>
        <p className="mt-2 text-[12px] text-mute">Invalid CA. Paste a 0x address or Sol mint in the header.</p>
      </div>
    );
  }
  const t = data?.token;
  if (isLoading) return <div className="text-[11px] text-mute">loading desk…</div>;
  if (!t) {
    const watchedEmpty = watch.watched(chain, ca);
    return (
      <div className="border border-hairline bg-surface px-6 py-16 text-center">
        <div className="text-sm tracking-[0.2em] text-gold">EMPTY DESK</div>
        <p className="mt-2 break-all font-mono text-[12px] text-mute">{chain} · <CopyCa ca={ca} display={ca} className="break-all font-mono text-[12px] text-mute" /></p>
        <p className="mt-2 text-[12px] text-mute">No Dex pair and no factory row. Links still resolve.</p>
        <button type="button" className={"mt-3 chip " + (watchedEmpty ? "chip-on" : "")} onClick={() => watch.toggle(chain, ca)}>{watchedEmpty ? "WATCHED" : "WATCH"}</button>
        <ExtLinks chain={chain} ca={ca} />
      </div>
    );
  }
  const phys = physicsBits({ pad: t.pad, stage: t.stage, quote: t.quote, curveFillPct: t.curveFillPct, taxEndsAt: t.taxEndsAt, ageSec: t.ageSec, liqUsd: t.liqUsd, padSub: t.padSub });
  const watched = watch.watched(t.chain, t.ca);
  const clones = collectClones(t, radarQ.data?.tokens || []);
  return (
    <div className="space-y-4">
      {/* Mobile sticky controls */}
      <div className="sticky top-0 z-10 flex justify-end gap-1 border-b border-hairline bg-bg/95 p-2 backdrop-blur sm:hidden">
        <button type="button" className={"chip " + (watched ? "chip-on" : "")} onClick={() => watch.toggle(t.chain, t.ca)}>{watched ? "WATCHED" : "WATCH"}</button>
        <button type="button" className="chip" onClick={() => watch.markFirst(t.chain, t.ca)}>FIRST</button>
        <ProposeDraft row={t} />
      </div>
      
      <div className="flex flex-wrap items-start justify-between gap-3 border border-hairline bg-surface p-4">
        <div>
          <div className="text-[11px] tracking-[0.2em] text-gold">{t.pad} · {t.lane} · {t.stage} · {deskOrganicBadge(t.boostsActive) || EM}</div>
          <h1 className="text-xl text-ink">{t.symbol} <span className="text-mute">{t.name}</span></h1>
          <div className="mt-1 break-all font-mono text-[11px] text-mute"><CopyCa ca={t.ca} display={t.ca} className="break-all font-mono text-[11px] text-mute" /></div>
        </div>
        {/* Desktop controls */}
        <div className="hidden text-right font-mono tabular sm:block">
          <div>heat {t.heat}</div>
          <div className={t.risk.level === "RED" ? "text-sell" : t.risk.level === "AMBER" ? "text-gold" : "text-live"}>{t.risk.level}</div>
          <button type="button" className={"mt-2 chip " + (watched ? "chip-on" : "")} onClick={() => watch.toggle(t.chain, t.ca)}>{watched ? "WATCHED" : "WATCH"}</button>
          <button type="button" className="ml-1 chip" onClick={() => watch.markFirst(t.chain, t.ca)}>FIRST</button>
          <ProposeDraft row={t} />
        </div>
        {/* Mobile heat/risk */}
        <div className="block text-right font-mono tabular sm:hidden">
          <div>heat {t.heat}</div>
          <div className={t.risk.level === "RED" ? "text-sell" : t.risk.level === "AMBER" ? "text-gold" : "text-live"}>{t.risk.level}</div>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Panel title="FACTS">
          <KV k="Mcap" v={formatUsd(t.mcapUsd)} />
          <KV k="Liq" v={formatUsd(t.liqUsd)} />
          <KV k="1h vol" v={formatUsd(t.vol1hUsd)} />
          <KV k="Buy%" v={formatPct(t.buyPct)} />
          <KV k="1h buyers" v={t.uniqueBuyers1h != null ? String(t.uniqueBuyers1h) : "na"} />
          <KV k="1h sellers" v={t.uniqueSellers1h != null ? String(t.uniqueSellers1h) : "na"} />
          <KV k="Age" v={formatAge(t.ageSec)} />
          <KV k="Quote" v={t.quote} />
          <KV k="Chain" v={t.chain} />
        </Panel>
        <Panel title="PHYSICS">
          <div className="text-lg font-mono text-gold">{phys.primary}</div>
          {phys.secondary ? <div className="text-sm text-mute">{phys.secondary}</div> : null}
          {t.pad === "O1" ? <div className="mt-2 text-[11px] text-mute">o1 is not a bonding curve. No CURVE fill.</div> : null}
          {t.curveFillPct != null && t.pad !== "O1" ? <KV k="Fill" v={Math.round(t.curveFillPct * 100) + "%"} /> : null}
          <KV k="Tax ends" v={t.taxEndsAt || EM} />
        </Panel>
        <Panel title="RISK / HOLDERS">
          <KV k="Risk" v={t.risk.level} />
          <KV k="Flags" v={t.risk.flags.length ? t.risk.flags.join(", ") : EM} />
          <KV k="Holders" v={t.holders != null ? t.holders.toLocaleString("en-US") : EM} />
          <KV k="Top10" v={t.top10Pct != null ? formatPct(t.top10Pct) : "na"} />
          <KV k="Dev" v={formatPct(t.devPct)} />
          <KV k="Bundle" v={formatPct(t.bundlePct)} />
          <KV k="Sniper" v={formatPct(t.sniperPct)} />
          <KV k="Clones" v={t.sameNameCopies != null ? String(t.sameNameCopies) : EM} />
        </Panel>
      </div>
      <Panel title="DEPLOYER">
        {isRealDeployer(t.deployer) ? (
          <>
            <div className="flex justify-between gap-3 border-b border-hairline/60 py-1 font-mono text-[12px] tabular">
              <span className="text-mute">Address</span>
              <CopyCa ca={t.deployer} display={t.deployer} className="break-all font-mono text-[12px]" />
            </div>
            <KV k={"7d on " + t.pad} v={t.deployerLaunchCount7d != null ? String(t.deployerLaunchCount7d) : EM} />
            {t.serialAmber ? <div className="mt-1 text-[11px] tracking-wide text-gold">AMBER SERIAL</div> : null}
          </>
        ) : (
          <KV k="Deployer" v={EM} />
        )}
      </Panel>
      {clones.length > 0 ? (
        <Panel title="CLONES">
          <div className="space-y-1 font-mono text-[12px] tabular">
            {clones.map((c) => (
              <a
                key={c.chain + ":" + c.ca}
                href={"/t/" + c.chain + "/" + c.ca}
                className="flex justify-between gap-3 border-b border-hairline/60 py-1 hover:text-gold"
              >
                <span>{c.chain} · {shortCa(c.ca)} · {formatUsd(c.mcapUsd)}</span>
                <span className="text-mute">{c.canonical ? "" : "COPY"}</span>
              </a>
            ))}
          </div>
        </Panel>
      ) : null}
      <Panel title="HEAT">
        <p className="text-[12px] text-mute">Heat {t.heat}/400 from freshness, buy pressure, vol/mcap, moving, and pad physics. Missing stats stay {EM} — never fabricated.</p>
      </Panel>
      <Panel title="LINKS">
        <ExtLinks chain={t.chain} ca={t.ca} gmgn={t.links.gmgn} dex={t.links.dex} scan={t.links.scan} />
      </Panel>
    </div>
  );
}


const PROPOSE_LS = "line.propose.v1";

function proposeKey(chain: string, ca: string): string {
  return chain + ":" + ca.toLowerCase();
}

function readProposeMap(): Record<string, number> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(PROPOSE_LS);
    const parsed = JSON.parse(raw || "{}") as Record<string, number>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function isProposeCooling(chain: string, ca: string, now = Date.now()): boolean {
  const ts = readProposeMap()[proposeKey(chain, ca)];
  return ts != null && now - ts < PROPOSE_COOLDOWN_MS;
}

function recordPropose(chain: string, ca: string, now = Date.now()) {
  const map = readProposeMap();
  map[proposeKey(chain, ca)] = now;
  try {
    localStorage.setItem(PROPOSE_LS, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

function ProposeDraft({ row }: { row: TokenRow }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [showDraft, setShowDraft] = useState(false);
  const [cooled, setCooled] = useState(false);
  useEffect(() => {
    setCooled(isProposeCooling(row.chain, row.ca));
  }, [row.chain, row.ca]);
  const gate = canPropose(row);
  const enabled = gate.ok && !cooled;
  return (
    <>
      <button
        type="button"
        id="line-propose-8"
        data-line="propose-8"
        aria-label={LINE_PROPOSE_LABEL}
        className="ml-1 chip disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!enabled}
        title={cooled ? "already proposed" : undefined}
        onClick={() => {
          if (!canPropose(row).ok || isProposeCooling(row.chain, row.ca)) return;
          const text = formatProposeDraft(row);
          copyText(text);
          recordPropose(row.chain, row.ca);
          setCooled(true);
          setDraft(text);
        }}
      >
        {LINE_PROPOSE_LABEL}
      </button>
      {draft ? (
        <>
          {/* Desktop: auto-shown */}
          <section className="mt-3 hidden w-full max-w-sm border border-hairline bg-surface p-3 text-left sm:block">
            <h2 className="mb-2 text-[11px] tracking-[0.2em] text-gold">PAYBOX DRAFT</h2>
            <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-ink">{draft}</pre>
          </section>
          {/* Mobile: behind toggle */}
          <div className="mt-3 block sm:hidden">
            <button
              type="button"
              className="chip"
              onClick={() => setShowDraft(!showDraft)}
            >
              {showDraft ? "Hide draft" : "Copy draft"}
            </button>
            {showDraft ? (
              <section className="mt-2 w-full border border-hairline bg-surface p-3 text-left">
                <h2 className="mb-2 text-[11px] tracking-[0.2em] text-gold">PAYBOX DRAFT</h2>
                <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-ink">{draft}</pre>
              </section>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );
}

function collectClones(t: TokenRow, radarTokens: TokenRow[]): TokenClone[] {
  const norm = (s?: string) => (s || "").trim().toUpperCase().replace(/['\s]/g, "");
  const sym = norm(t.symbol);
  const self = t.chain + ":" + t.ca.toLowerCase();
  const seen = new Set<string>([self]);
  const out: TokenClone[] = [];
  const mcapOf = (r: { mcapUsd?: number }) => (r.mcapUsd != null ? r.mcapUsd : -1);
  let bestKey = self;
  let bestMcap = mcapOf(t);
  const consider = (chain: string, ca: string, mcapUsd?: number) => {
    const id = chain + ":" + ca.toLowerCase();
    const m = mcapOf({ mcapUsd });
    if (m > bestMcap) {
      bestMcap = m;
      bestKey = id;
    }
  };
  for (const r of radarTokens) {
    if (norm(r.symbol) !== sym) continue;
    consider(r.chain, r.ca, r.mcapUsd);
    for (const c of r.clones || []) consider(c.chain, c.ca, c.mcapUsd);
  }
  for (const c of t.clones || []) consider(c.chain, c.ca, c.mcapUsd);
  const add = (chain: string, ca: string, symbol: string, mcapUsd?: number) => {
    const id = chain + ":" + ca.toLowerCase();
    if (seen.has(id)) return;
    seen.add(id);
    out.push({
      chain: chain as Chain,
      ca,
      symbol,
      mcapUsd,
      canonical: id === bestKey,
    });
  };
  for (const r of radarTokens) {
    if (norm(r.symbol) !== sym) continue;
    add(r.chain, r.ca, r.symbol, r.mcapUsd);
    for (const c of r.clones || []) add(c.chain, c.ca, c.symbol, c.mcapUsd);
  }
  for (const c of t.clones || []) add(c.chain, c.ca, c.symbol, c.mcapUsd);
  const selfRow = radarTokens.find((r) => r.chain === t.chain && r.ca.toLowerCase() === t.ca.toLowerCase());
  for (const c of selfRow?.clones || []) add(c.chain, c.ca, c.symbol, c.mcapUsd);
  return out;
}


function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-hairline bg-surface p-4">
      <h2 className="mb-2 text-[11px] tracking-[0.2em] text-gold">{title}</h2>
      {children}
    </section>
  );
}
function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-hairline/60 py-1 font-mono text-[12px] tabular">
      <span className="text-mute">{k}</span>
      <span>{v}</span>
    </div>
  );
}
function ExtLinks({ chain, ca, gmgn, dex, scan }: { chain: string; ca: string; gmgn?: string; dex?: string; scan?: string }) {
  const g = gmgn || "https://gmgn.ai/" + (chain === "solana" ? "sol" : chain) + "/token/" + ca;
  const d = dex || "https://dexscreener.com/" + chain + "/" + ca;
  const s = scan || (chain === "solana" ? "https://solscan.io/token/" : chain === "base" ? "https://base.blockscout.com/token/" : "https://robinhoodchain.blockscout.com/token/") + ca;
  return (
    <div className="flex flex-wrap gap-2 text-[12px]">
      <a className="chip hover:text-gold" href={g} target="_blank" rel="noreferrer">GMGN</a>
      <a className="chip hover:text-gold" href={d} target="_blank" rel="noreferrer">DexScreener</a>
      <a className="chip hover:text-gold" href={s} target="_blank" rel="noreferrer">Explorer</a>
    </div>
  );
}
