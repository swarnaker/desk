"use client";
import { WATCH_CHANGE_EVENT, WATCH_KEY, emptyWatch, mergeWatch, parseWatchJson, watchSet, type WatchFileV1, type WatchItem } from "@/lib/line/watch";
import { normalizeCa } from "@/lib/line/ca";
import type { Chain } from "@/lib/line/types";
import { useCallback, useEffect, useState } from "react";

function readWatch(): WatchFileV1 {
  try {
    const raw = localStorage.getItem(WATCH_KEY);
    return raw ? parseWatchJson(raw) : emptyWatch();
  } catch {
    return emptyWatch();
  }
}

function emitWatch() {
  try { window.dispatchEvent(new Event(WATCH_CHANGE_EVENT)); } catch { /* ssr */ }
}

export function useWatch() {
  const [file, setFile] = useState<WatchFileV1>(emptyWatch);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setFile(readWatch());
    setReady(true);
    function reload() { setFile(readWatch()); }
    window.addEventListener("storage", reload);
    window.addEventListener(WATCH_CHANGE_EVENT, reload);
    return () => {
      window.removeEventListener("storage", reload);
      window.removeEventListener(WATCH_CHANGE_EVENT, reload);
    };
  }, []);

  const persist = useCallback((next: WatchFileV1) => {
    setFile(next);
    try { localStorage.setItem(WATCH_KEY, JSON.stringify(next)); } catch { /* quota */ }
    emitWatch();
  }, []);

  const ids = watchSet(file);

  function toggle(chain: Chain, ca: string) {
    const nca = normalizeCa(chain, ca);
    const exists = file.items.some((i) => i.chain === chain && i.ca.toLowerCase() === nca.toLowerCase());
    if (exists) persist({ version: 1, items: file.items.filter((i) => !(i.chain === chain && i.ca.toLowerCase() === nca.toLowerCase())) });
    else persist({ version: 1, items: [...file.items, { chain, ca: nca, addedAt: new Date().toISOString() } as WatchItem] });
  }

  function markFirst(chain: Chain, ca: string) {
    const nca = normalizeCa(chain, ca);
    const items = file.items.map((i) =>
      i.chain === chain && i.ca.toLowerCase() === nca.toLowerCase() ? { ...i, first: true } : i,
    );
    if (!items.some((i) => i.chain === chain && i.ca.toLowerCase() === nca.toLowerCase())) {
      items.push({ chain, ca: nca, first: true, addedAt: new Date().toISOString() });
    }
    persist({ version: 1, items });
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "line-watch-v1.json";
    a.click();
  }

  function importJson(text: string) {
    persist(mergeWatch(file, parseWatchJson(text)));
  }

  return { file, ready, ids, toggle, markFirst, exportJson, importJson, watched: (chain: Chain, ca: string) => ids.has((chain + ":" + ca).toLowerCase()) || ids.has(ca.toLowerCase()) };
}
