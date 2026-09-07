"use client";
import { formatAge, formatPct, formatUsd, EM } from "@/lib/line/format";
import type { TokenRow } from "@/lib/line/types";
import { CopyCa } from "./CopyCa";

function FirstHourCard({ row }: { row: TokenRow }) {
  const href = "/t/" + row.chain + "/" + row.ca;
  const curvePct = row.curveFillPct != null ? Math.round(row.curveFillPct * 100) : null;
  const liqOrCurve = curvePct != null ? `${curvePct}%` : formatUsd(row.liqUsd);
  
  return (
    <a href={href} className="block border-b border-hairline bg-surface p-3 hover:bg-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-ink text-base break-words">{row.symbol}</h3>
            {row.canonical === false ? (
              <span className="shrink-0 border border-mute px-1 text-[9px] tracking-wide text-mute">COPY</span>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-mute tabular">
            <span className="text-gold">{row.heat}</span>
            <span>·</span>
            <span>{formatAge(row.ageSec)}</span>
            <span>·</span>
            <span>{formatUsd(row.mcapUsd)}</span>
            <span>·</span>
            <span>{liqOrCurve}</span>
            <span>·</span>
            <span className="uppercase">{row.quote}</span>
          </div>
          <div className="mt-1.5">
            <CopyCa ca={row.ca} />
          </div>
        </div>
      </div>
    </a>
  );
}

function FirstHourRowView({ row }: { row: TokenRow }) {
  const href = "/t/" + row.chain + "/" + row.ca;
  const curvePct = row.curveFillPct != null ? Math.round(row.curveFillPct * 100) : null;
  const liqOrCurve = curvePct != null ? `${curvePct}%` : formatUsd(row.liqUsd);
  
  return (
    <tr className="row-h border-b border-hairline hover:bg-card">
      <td>
        <div className="flex min-w-0 items-center gap-1.5">
          <a href={href} className="min-w-0 font-medium text-ink" aria-label={"Open " + row.symbol + " desk"}>{row.symbol}</a>
          {row.canonical === false ? (
            <span className="shrink-0 border border-mute px-1 text-[9px] tracking-wide text-mute">COPY</span>
          ) : null}
        </div>
      </td>
      <td className="whitespace-nowrap text-gold">{row.heat}</td>
      <td className="whitespace-nowrap text-mute">{formatAge(row.ageSec)}</td>
      <td className="whitespace-nowrap">{formatUsd(row.mcapUsd)}</td>
      <td className="whitespace-nowrap">{liqOrCurve}</td>
      <td className="whitespace-nowrap uppercase text-mute">{row.quote}</td>
      <td className="whitespace-nowrap font-mono text-mute"><CopyCa ca={row.ca} /></td>
    </tr>
  );
}

export function FirstHourTable({ rows }: { rows: TokenRow[] }) {
  return (
    <>
      {/* Mobile card list */}
      <div className="block border border-hairline bg-surface sm:hidden">
        {rows.length === 0 ? (
          <div className="px-3 py-8 text-center text-[11px] text-mute">
            No Pons bonding tokens under 1 hour. Empty is valid.
          </div>
        ) : (
          rows.map((r) => <FirstHourCard key={r.id} row={r} />)
        )}
      </div>
      
      {/* Desktop table */}
      <section className="hidden border border-hairline bg-surface sm:block">
        <div className="max-w-full overflow-x-auto">
          <table className="radar-table border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-b border-hairline text-[10px] uppercase tracking-wide text-mute">
                <th className="whitespace-nowrap font-normal">Token</th>
                <th className="whitespace-nowrap font-normal">Heat</th>
                <th className="whitespace-nowrap font-normal">Age</th>
                <th className="whitespace-nowrap font-normal">Mcap</th>
                <th className="whitespace-nowrap font-normal">Liq / Curve%</th>
                <th className="whitespace-nowrap font-normal">Quote</th>
                <th className="whitespace-nowrap font-normal">CA</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-[11px] text-mute">
                    No Pons bonding tokens under 1 hour. Empty is valid.
                  </td>
                </tr>
              ) : (
                rows.map((r) => <FirstHourRowView key={r.id} row={r} />)
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export { EM };
