"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function BottomNav() {
  const path = usePathname();

  const nav = [
    { href: "/", label: "RADAR" },
    { href: "/first-hour", label: "FIRST HOUR" },
    { href: "/account", label: "ACCOUNT" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-hairline bg-bg/95 backdrop-blur sm:hidden">
      <div className="flex items-center justify-around px-3 py-3">
        {nav.map((n) => {
          const isActive = path === n.href;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={
                "flex-1 text-center text-[11px] tracking-[0.18em] transition-colors " +
                (isActive ? "text-gold font-medium" : "text-mute hover:text-ink")
              }
            >
              {n.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
