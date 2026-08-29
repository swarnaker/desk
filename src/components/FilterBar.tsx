"use client";
import { DEFAULT_FILTERS } from "@/lib/line/filters";
import { LINE_EARLY_CHIP } from "@/lib/line/uiLabels";
import type { AgeGate, Filters, Pad } from "@/lib/line/types";

function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={"chip " + (on ? "chip-on" : "hover:text-ink")}>
      {children}
    </button>
  );
}

const PADS: { id: "ALL" | Pad; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "PONS", label: "Pons" },
  { id: "O1", label: "O1" },
  { id: "PUMP", label: "Pump" },
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
    <div className="flex flex-wrap items-center gap-1.5 border border-hairline bg-surface p-2 text-[11px]">
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
      <Chip on={filters.curve} onClick={() => set({ curve: !filters.curve })}>Curve</Chip>
      <Chip on={filters.birthOnly} onClick={() => set({ birthOnly: !filters.birthOnly })}>BIRTH</Chip>
      <Chip on={filters.wakeOnly} onClick={() => set({ wakeOnly: !filters.wakeOnly })}>WAKE</Chip>
      <Chip on={!!filters.early} onClick={() => set({ early: !filters.early })}>
        <span id="line-early" data-line="early" aria-label={LINE_EARLY_CHIP}>{LINE_EARLY_CHIP}</span>
      </Chip>
      <Chip on={filters.watchOnly} onClick={() => set({ watchOnly: !filters.watchOnly })}>Watch {watchCount}</Chip>
      <button type="button" className="chip hover:text-ink" onClick={() => setFilters(DEFAULT_FILTERS)}>Reset</button>
    </div>
  );
}
