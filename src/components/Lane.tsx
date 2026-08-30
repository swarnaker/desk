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

function riskLabel(row: TokenRow): string {
  const top10Known = row.top10Pct != null && Number.isFinite(row.top10Pct);
  if (row.risk.level === "RED") return "RED";
  if (row.risk.level === "GREEN") return "GREEN";
  if (!top10Known && row.risk.flags.some((f) => f.toUpperCase() === "UNK")) return "UNK";
  return "AMBER";
}

function deskPath(row: TokenRow) {
  return "/t/" + row.chain + "/" + row.ca;
}

export function RadarRowView({ row, watched, onWatch }: { row: TokenRow; watched: boolean; onWatch: () => void }) {
  const phys = physicsBits({
    pad: row.pad,
    stage: row.stage,
    quote: row.quote,
    curveFillPct: row.curveFillPct,
    taxEndsAt: row.taxEndsAt,
    ageSec: row.ageSec,
    liqUsd: row.liqUsd,
    padSub: row.padSub,
  });
  const buyCls = row.buyPct == null ? "text-mute" : row.buyPct >= 55 ? "text-buy" : row.buyPct < 45 ? "text-sell" : "text-mute";
  const href = deskPath(row);
  return (
    <tr className="row-h border-b border-hairline hover:bg-card">
      <td className="whitespace-nowrap px-2">
        <span className={"chip " + (row.lane === "NEW" ? "chip-on" : "")}>{row.lane}</span>
      </td>
      <td className="px-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <button type="button" aria-label={watched ? "WATCHED" : "WATCH"} title={watched ? "WATCHED" : "WATCH"} onClick={(e) => { e.stopPropagation(); onWatch(); }} className={"shrink-0 font-mono " + (watched ? "text-gold" : "text-mute")}>{watched ? "★" : "☆"}</button>
          <a href={href} className="min-w-0 truncate font-medium text-ink" aria-label={"Open " + row.symbol + " desk"}>{row.symbol}</a>
          {row.birth ? <span className="shrink-0 border border-gold px-1 text-[9px] tracking-wide text-gold">BIRTH</span> : null}
          {row.wake ? <span className="shrink-0 border border-gold px-1 text-[9px] tracking-wide text-gold">WAKE</span> : null}
        </div>
      </td>
      <td className="whitespace-nowrap px-2 font-mono text-mute"><CopyCa ca={row.ca} /></td>
      <td className="whitespace-nowrap px-2 text-mute">{row.padSub || row.pad}</td>
      <td className="whitespace-nowrap px-2 font-mono tabular text-gold">
        {phys.primary}
        {phys.quote && phys.quote !== "UNKNOWN" && (phys.kind === "locked" || phys.kind === "curve") ? (
          <span className="ml-1 text-[10px] text-mute">{phys.quote}</span>
        ) : null}
        {phys.secondary ? <span className="ml-1 text-[10px] text-mute">{phys.secondary}</span> : null}
      </td>
      <td className="whitespace-nowrap px-2 font-mono tabular">{row.heat}</td>
      <td className={"whitespace-nowrap px-2 " + riskColor(riskLabel(row))} title={row.risk.flags.join(", ") || undefined}>{riskLabel(row)}</td>
      <td className="whitespace-nowrap px-2 font-mono tabular">{formatUsd(row.mcapUsd)}</td>
      <td className="whitespace-nowrap px-2 font-mono tabular">{formatUsd(row.liqUsd)}</td>
      <td className="whitespace-nowrap px-2 font-mono tabular">{formatUsd(row.vol1hUsd)}</td>
      <td className={"whitespace-nowrap px-2 font-mono tabular " + buyCls}>{formatPct(row.buyPct)}</td>
      <td className="whitespace-nowrap px-2 font-mono tabular text-mute">{formatAge(row.ageSec)}</td>
      <td className="whitespace-nowrap px-2 text-[10px] text-mute">{row.stage}</td>
      <td className="whitespace-nowrap px-2">
        <span className="flex gap-1.5 text-[10px] tracking-wide">
          <a className="text-mute hover:text-gold" href={row.links.gmgn} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>GMGN</a>
          <a className="text-mute hover:text-gold" href={row.links.dex} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>DEX</a>
          <a className="text-mute hover:text-gold" href={row.links.scan} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>SCAN</a>
        </span>
      </td>
    </tr>
  );
}

export function RadarTable({ rows, watched, onWatch, sortColumn, sortDirection, onSort }: {
  rows: TokenRow[];
  watched: (ca: string, chain: TokenRow["chain"]) => boolean;
  onWatch: (row: TokenRow) => void;
  sortColumn: "heat" | "liq" | "vol1h" | "buyPct" | null;
  sortDirection: "asc" | "desc";
  onSort: (column: "heat" | "liq" | "vol1h" | "buyPct") => void;
}) {
  const sortIndicator = (col: "heat" | "liq" | "vol1h" | "buyPct") => {
    if (sortColumn !== col) return "";
    return sortDirection === "desc" ? " ↓" : " ↑";
  };

  return (
    <section className="border border-hairline bg-surface">
      <div className="max-w-full overflow-x-auto">
        <table className="radar-table min-w-[1240px] border-collapse text-left text-[11px]">
          <thead>
            <tr className="border-b border-hairline text-[10px] uppercase tracking-wide text-mute">
              <th className="whitespace-nowrap px-2 py-1.5 font-normal">Lane</th>
              <th className="whitespace-nowrap px-2 py-1.5 font-normal">Token</th>
              <th className="whitespace-nowrap px-2 py-1.5 font-normal">CA</th>
              <th className="whitespace-nowrap px-2 py-1.5 font-normal">Pad</th>
              <th className="whitespace-nowrap px-2 py-1.5 font-normal">Physics</th>
              <th className="whitespace-nowrap px-2 py-1.5 font-normal cursor-pointer hover:text-gold" onClick={() => onSort("heat")}>
                Heat{sortIndicator("heat")}
              </th>
              <th className="whitespace-nowrap px-2 py-1.5 font-normal">Risk</th>
              <th className="whitespace-nowrap px-2 py-1.5 font-normal">Mcap</th>
              <th className="whitespace-nowrap px-2 py-1.5 font-normal cursor-pointer hover:text-gold" onClick={() => onSort("liq")}>
                Liq{sortIndicator("liq")}
              </th>
              <th className="whitespace-nowrap px-2 py-1.5 font-normal cursor-pointer hover:text-gold" onClick={() => onSort("vol1h")}>
                1h vol{sortIndicator("vol1h")}
              </th>
              <th className="whitespace-nowrap px-2 py-1.5 font-normal cursor-pointer hover:text-gold" onClick={() => onSort("buyPct")}>
                Buy%{sortIndicator("buyPct")}
              </th>
              <th className="whitespace-nowrap px-2 py-1.5 font-normal">Age</th>
              <th className="whitespace-nowrap px-2 py-1.5 font-normal">Stage</th>
              <th className="whitespace-nowrap px-2 py-1.5 font-normal">Links</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={14} className="px-3 py-8 text-center text-[11px] text-mute">empty</td>
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
  );
}

export { EM };
