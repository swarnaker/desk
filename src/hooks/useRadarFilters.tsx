"use client";
import { DEFAULT_FILTERS } from "@/lib/line/filters";
import type { Filters } from "@/lib/line/types";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

const Ctx = createContext<{ filters: Filters; setFilters: (f: Filters) => void } | null>(null);

export function RadarFiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const value = useMemo(() => ({ filters, setFilters }), [filters]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRadarFilters() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("RadarFiltersProvider missing");
  return ctx;
}

export function useRadarFiltersOptional() {
  return useContext(Ctx);
}
