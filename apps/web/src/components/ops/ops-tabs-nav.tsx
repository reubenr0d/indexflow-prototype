"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/ops", label: "Overview" },
  { href: "/ops/trading", label: "Trading Desk" },
  { href: "/ops/engineering", label: "Engineering" },
  { href: "/ops/growth", label: "Growth / CMO" },
  { href: "/ops/risk", label: "Risk & Policy" },
  { href: "/ops/treasury", label: "Treasury" },
  { href: "/ops/infrastructure", label: "Infrastructure" },
] as const;

export function OpsTabsNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Ops sections"
      className="sticky top-14 z-20 border-b border-app-border bg-app-bg/95 backdrop-blur supports-[backdrop-filter]:bg-app-bg/75"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <ul role="tablist" className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((t) => {
            const active = pathname === t.href;
            return (
              <li key={t.href} role="presentation" className="shrink-0">
                <Link
                  href={t.href}
                  role="tab"
                  aria-selected={active}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors",
                    active
                      ? "border-app-accent text-app-text"
                      : "border-transparent text-app-muted hover:border-app-border-strong hover:text-app-text",
                  )}
                >
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
