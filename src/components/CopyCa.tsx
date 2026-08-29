"use client";
import { COPIED_HINT_MS, copyText } from "@/lib/line/copyCa";
import { shortCa } from "@/lib/line/format";
import { useEffect, useRef, useState } from "react";

export { COPIED_HINT_MS };

export function CopyCa({
  ca,
  display,
  className,
}: {
  ca: string;
  display?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);

  function onCopy(e: React.MouseEvent | React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Raw token.ca field only — never truncated/ellipsis display.
    copyText(ca);
    setCopied(true);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setCopied(false), COPIED_HINT_MS);
  }

  return (
    <button
      type="button"
      className={["cursor-pointer select-none bg-transparent p-0 font-inherit text-inherit", className].filter(Boolean).join(" ")}
      style={{ cursor: "pointer" }}
      title="Copy CA"
      aria-label={"Copy " + ca}
      onClick={onCopy}
      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onCopy(e); }}
    >
      {copied ? "copied" : (display ?? shortCa(ca))}
    </button>
  );
}
