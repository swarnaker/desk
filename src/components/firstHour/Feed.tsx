"use client";
import type { FirstHourToken, FilterType, SortType, HealthSource } from "@/lib/firstHour/types";
import { FirstHourTokenRow } from "./TokenRow";
import { useState, useEffect } from "react";

interface FeedProps {
  tokens: FirstHourToken[];
  loading: boolean;
  filter: FilterType;
  sort: SortType;
  search: string;
  onFilterChange: (filter: FilterType) => void;
  onSortChange: (sort: SortType) => void;
  health: HealthSource[];
}

export function FirstHourFeed({
  tokens,
  loading,
  filter,
  sort,
  search,
  onFilterChange,
  onSortChange,
  health,
}: FeedProps) {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const checkDesktop = () => setIsDesktop(window.innerWidth >= 640);
    checkDesktop();
    window.addEventListener("resize", checkDesktop);
    return () => window.removeEventListener("resize", checkDesktop);
  }, []);

  let filtered = tokens.filter((t) => {
    if (t.ageSec == null || t.ageSec >= 3600) return false;

    if (search) {
      const s = search.toLowerCase();
      if (
        !t.token.toLowerCase().includes(s) &&
        !t.symbol?.toLowerCase().includes(s) &&
        !t.name?.toLowerCase().includes(s)
      ) {
        return false;
      }
    }

    if (filter === "new" && (t.ageSec == null || t.ageSec > 600)) return false;
    if (filter === "bonding" && t.graduated) return false;
    if (filter === "almost-bonded" && (!t.curveFillPct || t.curveFillPct < 80 || t.graduated))
      return false;
    if (filter === "graduated" && !t.graduated) return false;
    if (filter === "heat200" && (!t.heat || t.heat < 320 || !t.mcapUsd || t.mcapUsd < 50000)) return false;

    return true;
  });

  if (sort === "heat") {
    filtered.sort((a, b) => (b.heat || 0) - (a.heat || 0));
  } else if (sort === "newest") {
    filtered.sort((a, b) => (a.ageSec || 0) - (b.ageSec || 0));
  } else if (sort === "mcap") {
    filtered.sort((a, b) => (b.mcapUsd || 0) - (a.mcapUsd || 0));
  } else if (sort === "curve") {
    filtered.sort((a, b) => (b.curveFillPct || 0) - (a.curveFillPct || 0));
  }

  return (
    <div>
      <div className="flex gap-4 mb-4 flex-wrap">
        <div className="flex gap-2 items-center">
          <span className="text-xs text-mute tracking-wider">
            SCAN:
          </span>
          {(["all", "new", "bonding", "almost-bonded", "graduated", "heat200"] as FilterType[]).map(
            (f) => (
              <button
                key={f}
                onClick={() => onFilterChange(f)}
                className={filter === f ? "chip chip-on" : "chip"}
              >
                {f === "heat200" ? "Heat>200" : f.replace("-", " ").toUpperCase()}
              </button>
            )
          )}
        </div>

        <div className="flex gap-2 items-center">
          <span className="text-xs text-mute tracking-wider">
            SORT:
          </span>
          {(["heat", "newest", "mcap", "curve"] as SortType[]).map((s) => (
            <button
              key={s}
              onClick={() => onSortChange(s)}
              className={sort === s ? "chip chip-on" : "chip"}
            >
              {s === "curve" ? "CURVE %" : s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {health.length > 0 && (
        <div className="mb-4 border border-hairline bg-surface p-3">
          <div className="font-mono text-xs text-mute space-y-1">
            {health.map((h, i) => (
              <div key={i}>
                <span className={h.ok ? "text-green-500" : "text-sell"}>
                  {h.ok ? "✓" : "✗"}
                </span>{" "}
                {h.name}: {h.detail}
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="border border-hairline bg-surface px-4 py-10 text-center text-xs text-mute">
          Loading first hour tokens...
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-hairline bg-surface px-4 py-10 text-center text-xs text-mute">
          {tokens.length === 0 && health.some(h => !h.ok) 
            ? "No bonding data. Check health above."
            : "No Pons tokens under 1 hour"}
        </div>
      ) : isDesktop ? (
        <section className="border border-hairline bg-surface">
          <div className="max-w-full overflow-x-auto">
            <table className="radar-table border-collapse text-left text-[11px]">
              <thead>
                <tr className="border-b border-hairline text-[10px] uppercase tracking-wide text-mute">
                  <th className="whitespace-nowrap font-normal">Token</th>
                  <th className="whitespace-nowrap font-normal">Heat</th>
                  <th className="whitespace-nowrap font-normal">Age</th>
                  <th className="whitespace-nowrap font-normal">Mcap</th>
                  <th className="whitespace-nowrap font-normal">Liq/Curve%</th>
                  <th className="whitespace-nowrap font-normal">CA</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((token) => (
                  <FirstHourTokenRow
                    key={token.token}
                    token={token}
                    variant="table"
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className="border border-hairline bg-surface">
          {filtered.map((token) => (
            <FirstHourTokenRow
              key={token.token}
              token={token}
              variant="card"
            />
          ))}
        </div>
      )}
    </div>
  );
}
