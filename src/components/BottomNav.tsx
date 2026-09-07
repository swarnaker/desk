"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function BottomNav() {
  const path = usePathname();
  const nav = [
    { href: "/", label: "RADAR" },
    { href: "/first-hour", label: "1H" },
    { href: "/account", label: "ACCT" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-hairline bg-bg/95 backdrop-blur sm:hidden">
      <div className="flex items-center justify-around px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {nav.map((n, i) => (
          <span key={n.href} className="flex items-center gap-2">
            {i > 0 ? <span className="text-hairline">·</span> : null}
            <Link
              href={n.href}
              className={`text-[11px] tracking-[0.18em] ${
                path === n.href ? "text-gold font-medium" : "text-mute"
              }`}
            >
              {n.label}
            </Link>
          </span>
        ))}
      </div>
    </nav>
  );
}
