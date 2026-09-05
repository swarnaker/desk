"use client";
import { formatAge, formatPct, formatUsd, EM } from "@/lib/line/format";
import { physicsBits } from "@/lib/line/physics";
import type { TokenRow } from "@/lib/line/types";
import { CopyCa } from "./CopyCa";

function riskColor(label: string) {
  if (label === "RED") return "text-sell";
  if (label === "GREEN") return "text-live";
  if (label === "UNK") return "text-mute";
  return "text-gold";
}

function riskLabel(row: TokenRow): string | null {
  const top10Known = row.top10Pct != null && Number.isFinite(row.top10Pct);
  if (!top10Known && row.risk.flags.some((f) => f.toUpperCase() === "UNK")) return null;
  if (row.risk.level === "RED") return "RED";
  if (row.risk.level === "GREEN") return "GREEN";
  return "AMBER";
}

function deskPath(row: TokenRow) {
  return "/t/" + row.chain + "/" + row.ca;
}

function RadarCard({ row, watched, onWatch }: { row: TokenRow; watched: boolean; onWatch: () => void }) {
  const href = deskPath(row);
  return (
    <a href={href} className="block border-b border-hairline bg-surface p-3 hover:bg-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={watched ? "WATCHED" : "WATCH"}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onWatch(); }}
              className={"shrink-0 font-mono text-sm " + (watched ? "text-gold" : "text-mute")}
            >
              {watched ? "★" : "☆"}
            </button>
            <h3 className="font-medium text-ink text-base break-words">{row.symbol}</h3>
            {row.birth ? <span className="shrink-0 border border-gold px-1 text-[9px] tracking-wide text-gold">BIRTH</span> : null}
            {row.wake ? <span className="shrink-0 border border-gold px-1 text-[9px] tracking-wide text-gold">WAKE</span> : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-mute tabular">
            <span>{row.heat}</span>
            <span>·</span>
            <span>{formatAge(row.ageSec)}</span>
            <span>·</span>
            <span>{formatUsd(row.mcapUsd)}</span>
            <span>·</span>
            <span>{formatUsd(row.vol1hUsd)}</span>
          </div>
          <div className="mt-1.5">
            <CopyCa ca={row.ca} />
          </div>
        </div>
        <div className="shrink-0 text-right font-mono text-[11px] tabular">
          <div className="text-base font-medium">{row.heat}</div>
          {riskLabel(row) ? <div className={"text-[10px] " + riskColor(riskLabel(row)!)}>{riskLabel(row)}</div> : null}
        </div>
      </div>
    </a>
  );
}

export function RadarRowView({ row, watched, onWatch }: { row: TokenRow; watched: boolean; onWatch: () => void }) {
  const buyCls = row.buyPct == null ? "text-mute" : row.buyPct >= 55 ? "text-buy" : row.buyPct < 45 ? "text-sell" : "text-mute";
  const href = deskPath(row);
  return (
    <tr className="row-h border-b border-hairline hover:bg-card">
      <td>
        <div className="flex min-w-0 items-center gap-1.5">
          <button type="button" aria-label={watched ? "WATCHED" : "WATCH"} title={watched ? "WATCHED" : "WATCH"} onClick={(e) => { e.stopPropagation(); onWatch(); }} className={"shrink-0 font-mono " + (watched ? "text-gold" : "text-mute")}>{watched ? "★" : "☆"}</button>
          <a href={href} className="min-w-0 font-medium text-ink" aria-label={"Open " + row.symbol + " desk"}>{row.symbol}</a>
          {row.birth ? <span className="shrink-0 border border-gold px-1 text-[9px] tracking-wide text-gold">BIRTH</span> : null}
          {row.wake ? <span className="shrink-0 border border-gold px-1 text-[9px] tracking-wide text-gold">WAKE</span> : null}
        </div>
      </td>
      <td className="whitespace-nowrap">{row.heat}</td>
      <td className="whitespace-nowrap text-mute">{formatAge(row.ageSec)}</td>
      <td className="whitespace-nowrap">{formatUsd(row.mcapUsd)}</td>
      <td className="whitespace-nowrap">{formatUsd(row.liqUsd)}</td>
      <td className="whitespace-nowrap">{formatUsd(row.vol1hUsd)}</td>
      <td className={"whitespace-nowrap " + buyCls}>{formatPct(row.buyPct)}</td>
      <td className="whitespace-nowrap">
        <span className="flex gap-1.5 text-[10px] tracking-wide">
          <a className="text-mute hover:text-gold" href={row.links.gmgn} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>GMGN</a>
          <a className="text-mute hover:text-gold" href={row.links.dex} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>DEX</a>
          <a className="text-mute hover:text-gold" href={row.links.scan} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>SCAN</a>
        </span>
      </td>
      <td className="whitespace-nowrap text-mute">{row.padSub || row.pad}</td>
      <td className="whitespace-nowrap font-mono text-mute"><CopyCa ca={row.ca} /></td>
    </tr>
  );
}

export function RadarTable({ rows, watched, onWatch, sortColumn, sortDirection, onSort }: {
  rows: TokenRow[];
  watched: (ca: string, chain: TokenRow["chain"]) => boolean;
  onWatch: (row: TokenRow) => void;
  sortColumn: "heat" | "mcap" | "liq" | "vol1h" | "buyPct" | null;
  sortDirection: "asc" | "desc";
  onSort: (column: "heat" | "mcap" | "liq" | "vol1h" | "buyPct") => void;
}) {
  const sortIndicator = (col: "heat" | "mcap" | "liq" | "vol1h" | "buyPct") => {
    if (sortColumn !== col) return "";
    return sortDirection === "desc" ? " ↓" : " ↑";
  };

  return (
    <>
      {/* Mobile card list */}
      <div className="block border border-hairline bg-surface sm:hidden">
        {rows.length === 0 ? (
          <div className="px-3 py-8 text-center text-[11px] text-mute">empty</div>
        ) : (
          rows.map((r) => (
            <RadarCard key={r.id} row={r} watched={watched(r.ca, r.chain)} onWatch={() => onWatch(r)} />
          ))
        )}
      </div>
      
      {/* Desktop table */}
      <section className="hidden border border-hairline bg-surface sm:block">
        <div className="max-w-full overflow-x-auto">
          <table className="radar-table border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-b border-hairline text-[10px] uppercase tracking-wide text-mute">
                <th className="whitespace-nowrap font-normal">Token</th>
                <th className="whitespace-nowrap font-normal cursor-pointer hover:text-gold" onClick={() => onSort("heat")}>
                  Heat{sortIndicator("heat")}
                </th>
                <th className="whitespace-nowrap font-normal">Age</th>
                <th className="whitespace-nowrap font-normal cursor-pointer hover:text-gold" onClick={() => onSort("mcap")}>
                  Mcap{sortIndicator("mcap")}
                </th>
                <th className="whitespace-nowrap font-normal cursor-pointer hover:text-gold" onClick={() => onSort("liq")}>
                  Liq{sortIndicator("liq")}
                </th>
                <th className="whitespace-nowrap font-normal cursor-pointer hover:text-gold" onClick={() => onSort("vol1h")}>
                  1h vol{sortIndicator("vol1h")}
                </th>
                <th className="whitespace-nowrap font-normal cursor-pointer hover:text-gold" onClick={() => onSort("buyPct")}>
                  Buy%{sortIndicator("buyPct")}
                </th>
                <th className="whitespace-nowrap font-normal">Links</th>
                <th className="whitespace-nowrap font-normal">Pad</th>
                <th className="whitespace-nowrap font-normal">CA</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-[11px] text-mute">empty</td>
                </tr>
              ) : (
                rows.map((r) => (
                  <RadarRowView key={r.id} row={r} watched={watched(r.ca, r.chain)} onWatch={() => onWatch(r)} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export { EM };
