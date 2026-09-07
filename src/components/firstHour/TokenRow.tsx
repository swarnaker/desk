import type { FirstHourToken } from "@/lib/firstHour/types";

interface TokenRowProps {
  token: FirstHourToken;
  variant?: "table" | "card";
}

function formatAge(ageSec?: number): string {
  if (ageSec == null) return "—";
  const min = Math.floor(ageSec / 60);
  return `${min}m`;
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
      <tr className="border-b border-hairline hover:bg-card">
        <td className="px-2 py-2.5">
          <div>
            <div className="text-xs text-ink font-medium">
              {displayName}
            </div>
            <div className="font-mono text-[10px] text-mute">
              {tokenLabel}
            </div>
          </div>
        </td>

        <td className="px-2 py-2.5">
          <div className={`heat-circle ${isHot ? "bg-gold text-bg" : "bg-surface text-mute"}`}>
            {token.heat || 0}
          </div>
        </td>

        <td className="px-2 py-2.5 font-mono text-[11px] tabular text-mute">
          {formatAge(token.ageSec)}
        </td>

        <td className="px-2 py-2.5 font-mono text-xs tabular text-mute">
          ${formatNumber(token.mcapUsd)}
        </td>

        <td className="px-2 py-2.5 font-mono text-xs tabular text-mute">
          {token.graduated
            ? `$${formatNumber(token.liqUsd)}`
            : formatPercent(token.curveFillPct)}
        </td>

        <td className="px-2 py-2.5">
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
    <div className="border-b border-hairline bg-surface p-3 hover:bg-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-ink font-medium mb-0.5">
            {displayName}
          </div>
          <div className="font-mono text-[10px] text-mute mb-2">
            {tokenLabel}
          </div>
          <div className="font-mono text-[11px] text-mute tabular">
            {formatAge(token.ageSec)} · ${formatNumber(token.mcapUsd)} · {token.graduated
              ? `$${formatNumber(token.liqUsd)}`
              : formatPercent(token.curveFillPct)}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`heat-circle mb-1.5 ${isHot ? "bg-gold text-bg" : "bg-card text-mute"}`}>
            {token.heat || 0}
          </div>
          <button
            onClick={() => copyToClipboard(token.token)}
            className="font-mono text-[10px] text-mute hover:text-gold"
          >
            {token.token.slice(0, 6)}...{token.token.slice(-4)}
          </button>
        </div>
      </div>
    </div>
  );
}
