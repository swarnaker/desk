import type { FirstHourToken } from "@/lib/firstHour/types";

interface TokenRowProps {
  token: FirstHourToken;
  variant?: "table" | "card";
}

function formatAge(ageSec?: number): string {
  if (ageSec == null) return "—";
  const min = Math.floor(ageSec / 60);
  const sec = ageSec % 60;
  return `${min}m${sec}s`;
}

function formatNumber(n?: number): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toFixed(0);
}

function formatPercent(p?: number): string {
  if (p == null) return "—";
  return p.toFixed(1) + "%";
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

export function FirstHourTokenRow({ token, variant = "table" }: TokenRowProps) {
  const displayName = token.name || "Unknown";
  const displaySymbol = token.symbol || "???";
  const tokenLabel = token.quoteSymbol ? `${displaySymbol}/${token.quoteSymbol}` : displaySymbol;
  const isHot = (token.heat || 0) >= 320 && (token.mcapUsd || 0) >= 50000;

  if (variant === "table") {
    return (
      <tr className="border-b border-hairline hover:bg-surface/50 transition-colors">
        <td className="px-2 py-2">
          <div>
            <div className="text-xs text-ink">
              {displayName}
            </div>
            <div className="font-mono text-[10px] text-mute">
              {tokenLabel}
            </div>
          </div>
        </td>

        <td className="px-2 py-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-full font-mono text-[11px] font-bold tabular"
            style={{
              backgroundColor: isHot ? "#E8B923" : "#2a2a2a",
              color: isHot ? "#0a0a0a" : "#888",
            }}
          >
            {token.heat || 0}
          </div>
        </td>

        <td className="px-2 py-2 font-mono text-xs tabular text-mute">
          {formatAge(token.ageSec)}
        </td>

        <td className="px-2 py-2 font-mono text-xs tabular text-mute">
          ${formatNumber(token.mcapUsd)}
        </td>

        <td className="px-2 py-2 font-mono text-xs tabular text-mute">
          {token.graduated
            ? `$${formatNumber(token.liqUsd)}`
            : formatPercent(token.curveFillPct)}
        </td>

        <td className="px-2 py-2">
          <button
            onClick={() => copyToClipboard(token.token)}
            className="font-mono text-[10px] text-mute hover:text-gold"
            title="Copy address"
          >
            {token.token.slice(0, 6)}...{token.token.slice(-4)}
          </button>
        </td>
      </tr>
    );
  }

  return (
    <div className="border border-hairline bg-surface p-2 hover:border-gold/30 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-ink">{displayName}</span>
        <span className="font-mono text-[10px] text-mute">{tokenLabel}</span>
        <div
          className="ml-auto flex h-7 w-7 items-center justify-center rounded-full font-mono text-[11px] font-bold tabular"
          style={{
            backgroundColor: isHot ? "#E8B923" : "#2a2a2a",
            color: isHot ? "#0a0a0a" : "#888",
          }}
        >
          {token.heat || 0}
        </div>
      </div>

      <div className="font-mono text-[11px] mb-2 text-mute tabular">
        {formatAge(token.ageSec)} · ${formatNumber(token.mcapUsd)} · {token.graduated
          ? `$${formatNumber(token.liqUsd)}`
          : formatPercent(token.curveFillPct)}
      </div>

      <button
        onClick={() => copyToClipboard(token.token)}
        className="font-mono text-[10px] text-mute hover:text-gold"
      >
        {token.token.slice(0, 6)}...{token.token.slice(-4)}
      </button>
    </div>
  );
}
