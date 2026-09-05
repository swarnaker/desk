"use client";
import { DEFAULT_FILTERS } from "@/lib/line/filters";
import { LINE_EARLY_CHIP } from "@/lib/line/uiLabels";
import type { AgeGate, Filters } from "@/lib/line/types";

function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={"chip " + (on ? "chip-on" : "hover:text-ink")}>
      {children}
    </button>
  );
}

const PADS: { id: "PONS" | "O1" | "BOTH"; label: string }[] = [
  { id: "PONS", label: "Pons" },
  { id: "O1", label: "O1" },
  { id: "BOTH", label: "Both" },
];

const AGES: { id: AgeGate; label: string }[] = [
  { id: "1h", label: "1h" },
  { id: "6h", label: "6h" },
  { id: "any", label: "any" },
];

export function FilterBar({
  filters, setFilters, watchCount,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  watchCount: number;
}) {
  const set = (p: Partial<Filters>) => setFilters({ ...filters, ...p });
  return (
    <div className="overflow-x-auto border border-hairline bg-surface p-2 text-[11px]">
      <div className="flex min-w-max items-center gap-1.5 sm:flex-wrap sm:min-w-0">
        {PADS.map((p) => (
          <Chip key={p.id} on={filters.pad === p.id} onClick={() => set({ pad: p.id })}>
            {p.label}
          </Chip>
        ))}
        <span className="mx-1 text-hairline">|</span>
        {AGES.map((a) => (
          <Chip key={a.id} on={filters.ageGate === a.id} onClick={() => set({ ageGate: a.id })}>
            {a.label}
          </Chip>
        ))}
        <span className="mx-1 text-hairline">|</span>
        <Chip on={!!filters.early} onClick={() => set({ early: !filters.early, wakeOnly: false })}>
          <span id="line-early" data-line="early" aria-label={LINE_EARLY_CHIP}>{LINE_EARLY_CHIP}</span>
        </Chip>
        <Chip on={filters.wakeOnly} onClick={() => set({ wakeOnly: !filters.wakeOnly, early: false })}>WAKE</Chip>
        <Chip on={filters.watchOnly} onClick={() => set({ watchOnly: !filters.watchOnly })}>Watch {watchCount}</Chip>
        <button type="button" className="chip hover:text-ink" onClick={() => setFilters(DEFAULT_FILTERS)}>Reset</button>
      </div>
    </div>
  );
}
