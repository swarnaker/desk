"use client";

import { useState, useEffect } from "react";
import type { FirstHourToken, FirstHourResponse, FilterType, SortType } from "@/lib/firstHour/types";
import { FirstHourFeed } from "@/components/firstHour/Feed";

export default function FirstHourPage() {
  const [tokens, setTokens] = useState<FirstHourToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<any[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [sort, setSort] = useState<SortType>("heat");
  const [search, setSearch] = useState("");

  const fetchTokens = async () => {
    try {
      const res = await fetch("/api/first-hour", { cache: "no-store" });
      if (res.ok) {
        const data: FirstHourResponse = await res.json();
        setTokens(data.tokens);
        setHealth(data.health);
      }
    } catch (err) {
      console.error("Failed to fetch first hour tokens:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTokens();
    const interval = setInterval(fetchTokens, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-lg font-semibold tracking-[0.2em] text-gold">FIRST HOUR</h1>
        <p className="text-xs text-mute">Pons bonding curve tokens under 1 hour</p>
      </div>

      <FirstHourFeed
        tokens={tokens}
        loading={loading}
        filter={filter}
        sort={sort}
        search={search}
        onFilterChange={setFilter}
        onSortChange={setSort}
        health={health}
      />
    </div>
  );
}
