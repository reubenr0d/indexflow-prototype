"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutGrid,
  Layers,
  Radio,
  Activity,
  ShieldAlert,
  Gauge,
} from "lucide-react";

const adminNav = [
  { href: "/admin", label: "Overview", icon: LayoutGrid },
  { href: "/admin/baskets", label: "Baskets", icon: Layers },
  { href: "/admin/risk", label: "Risk Controls", icon: ShieldAlert },
  { href: "/admin/funding", label: "Funding", icon: Gauge },
  { href: "/admin/oracle", label: "Oracle", icon: Radio },
  { href: "/admin/pool", label: "Pool", icon: Activity },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <>
      <aside className="hidden w-56 shrink-0 border-r border-app-border bg-app-bg-subtle/80 lg:block">
        <nav className="sticky top-14 space-y-0.5 p-3">
          {adminNav.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-app-surface text-app-text shadow-[var(--shadow)]"
                    : "text-app-muted hover:bg-app-surface hover:text-app-text"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-app-border bg-app-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        <div className="flex justify-around py-1.5">
          {adminNav.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-w-[3.5rem] flex-col items-center gap-0.5 rounded-md px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide",
                  isActive ? "text-app-accent" : "text-app-muted"
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
