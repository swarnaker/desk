"use client";
import { COPY } from "@/lib/line/constants";
import { applyFilters } from "@/lib/line/filters";
import { sortLane, splitLanes } from "@/lib/line/lane";
import { radarApiPath } from "@/lib/line/radarPath";
import type { RadarPayload, TokenRow } from "@/lib/line/types";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FilterBar } from "./FilterBar";
import { RadarTable } from "./Lane";
import { useRadarFilters } from "@/hooks/useRadarFilters";
import { useWatch } from "@/hooks/useWatch";

type SortColumn = "heat" | "mcap" | "liq" | "vol1h" | "buyPct" | null;
type SortDirection = "asc" | "desc";

function MobileSortBar({ sortColumn, sortDirection, onSort }: {
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (col: SortColumn) => void;
}) {
  const btn = (col: SortColumn, label: string) => {
    const active = sortColumn === col;
    const cls = active ? "chip-on" : "chip hover:text-ink";
    const indicator = active ? (sortDirection === "desc" ? " ↓" : " ↑") : "";
    return (
      <button type="button" className={cls} onClick={() => onSort(col)}>
        {label}{indicator}
      </button>
    );
  };
  return (
    <div className="flex gap-1.5 border border-hairline bg-surface p-2 text-[11px] sm:hidden">
      {btn("heat", "HEAT")}
      {btn("mcap", "MCAP")}
      {btn("liq", "LIQ")}
      {btn("vol1h", "1H")}
      {btn("buyPct", "BUY%")}
    </div>
  );
}

export function RadarBoard() {
  const { filters, setFilters } = useRadarFilters();
  const watch = useWatch();
  const watchedIds = watch.file.items.map((i) => i.chain + ":" + i.ca);
  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  
  const { data, isLoading, error } = useQuery({
    queryKey: ["radar", filters.ageGate, filters.curve, watchedIds.join(","), filters.pad, filters.early, filters.wakeOnly, filters.birthOnly],
    queryFn: async () => (await fetch(radarApiPath(filters.ageGate, filters.curve, watchedIds, filters.pad, filters.early, filters.wakeOnly, filters.birthOnly), { cache: "no-store" })).json() as Promise<RadarPayload>,
    refetchInterval: 20_000,
  });
  const tokens = data?.tokens || [];
  const filtered = useMemo(
    () => applyFilters(tokens, filters, watch.ids),
    [tokens, filters, watch.ids],
  );
  
  const { lanes, tableRows } = useMemo(() => {
    const allRows = sortLane(filtered);
    const lanes = splitLanes(filtered);
    return { lanes, tableRows: allRows };
  }, [filtered]);

  const sortedRows = useMemo(() => {
    if (!sortColumn) return tableRows;
    return [...tableRows].sort((a, b) => {
      let aVal = 0;
      let bVal = 0;
      if (sortColumn === "heat") {
        aVal = a.heat;
        bVal = b.heat;
      } else if (sortColumn === "mcap") {
        aVal = a.mcapUsd ?? 0;
        bVal = b.mcapUsd ?? 0;
      } else if (sortColumn === "liq") {
        aVal = a.liqUsd ?? 0;
        bVal = b.liqUsd ?? 0;
      } else if (sortColumn === "vol1h") {
        aVal = a.vol1hUsd ?? 0;
        bVal = b.vol1hUsd ?? 0;
      } else if (sortColumn === "buyPct") {
        aVal = a.buyPct ?? 0;
        bVal = b.buyPct ?? 0;
      }
      return sortDirection === "desc" ? bVal - aVal : aVal - bVal;
    });
  }, [tableRows, sortColumn, sortDirection]);

  const handleColumnSort = (column: SortColumn) => {
    if (sortColumn === column) {
      if (sortDirection === "desc") {
        setSortDirection("asc");
      } else {
        setSortColumn(null);
        setSortDirection("desc");
      }
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  const bookCount = lanes.BOOK.length;

  return (
    <div className="space-y-3">
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        watchCount={watch.file.items.length}
      />
      {isLoading ? <div className="text-[11px] text-mute">loading radar…</div> : null}
      {error ? <div className="text-[11px] text-sell">radar error</div> : null}
      {!isLoading && filtered.length === 0 ? (
        <div className="border border-hairline bg-surface px-4 py-10 text-center text-[12px] text-mute">
          {data?.stale ? "STALE · empty board. Adapters missed or Dex is down." : "No live rows. Empty is valid. LINE never invents tokens."}
        </div>
      ) : null}
      <div className="flex gap-3 font-mono text-[11px] tabular text-mute">
        <span>NEW {lanes.NEW.length}</span>
        <span>STRETCH {lanes.STRETCH.length}</span>
        <span>BOOK {bookCount}</span>
      </div>
      <MobileSortBar sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleColumnSort} />
      {filtered.length > 0 ? (
        <RadarTable
          rows={sortedRows}
          watched={(ca, chain) => watch.watched(chain, ca)}
          onWatch={(r: TokenRow) => watch.toggle(r.chain, r.ca)}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={handleColumnSort}
        />
      ) : null}
    </div>
  );
}
