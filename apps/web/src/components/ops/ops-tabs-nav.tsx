"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  CandlestickChart,
  LayoutGrid,
  Megaphone,
  Server,
  ShieldAlert,
  Wallet,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TABS: ReadonlyArray<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/ops", label: "Overview", icon: LayoutGrid },
  { href: "/ops/trading", label: "Trading Desk", icon: CandlestickChart },
  { href: "/ops/engineering", label: "Engineering", icon: Wrench },
  { href: "/ops/growth", label: "Growth / CMO", icon: Megaphone },
  { href: "/ops/risk", label: "Risk & Policy", icon: ShieldAlert },
  { href: "/ops/treasury", label: "Treasury", icon: Wallet },
  { href: "/ops/infrastructure", label: "Infrastructure", icon: Server },
];

export function OpsTabsNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Ops sections"
      className="sticky top-14 z-20 border-b border-app-border bg-app-bg/95 backdrop-blur supports-[backdrop-filter]:bg-app-bg/75"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <ul
          role="tablist"
          className="-mb-px flex gap-1 overflow-x-auto sm:gap-0 sm:overflow-x-visible"
        >
          {TABS.map((t) => {
            const active = pathname === t.href;
            const Icon = t.icon;
            return (
              <li
                key={t.href}
                role="presentation"
                className="shrink-0 sm:flex-1 sm:shrink"
              >
                <Link
                  href={t.href}
                  role="tab"
                  aria-selected={active}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors",
                    active
                      ? "border-app-accent text-app-text"
                      : "border-transparent text-app-muted hover:border-app-border-strong hover:text-app-text",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0 transition-colors",
                      active ? "text-app-accent" : "text-app-muted",
                    )}
                    aria-hidden
                  />
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
