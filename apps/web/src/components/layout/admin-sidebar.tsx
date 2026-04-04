"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutGrid, Layers, Crosshair, Radio, Activity } from "lucide-react";

const adminNav = [
  { href: "/admin", label: "Overview", icon: LayoutGrid },
  { href: "/admin/baskets", label: "Baskets", icon: Layers },
  { href: "/admin/positions", label: "Positions", icon: Crosshair },
  { href: "/admin/oracle", label: "Oracle", icon: Radio },
  { href: "/admin/pool", label: "Pool", icon: Activity },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 border-r border-neutral-100 bg-neutral-50/50 dark:border-neutral-800 dark:bg-neutral-900/50 lg:block">
        <nav className="sticky top-16 space-y-1 p-4">
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
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-white"
                    : "text-neutral-500 hover:bg-white/50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800/50 dark:hover:text-white"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-100 bg-white/90 backdrop-blur-xl dark:border-neutral-800 dark:bg-neutral-950/90 lg:hidden">
        <div className="flex justify-around py-2">
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
                  "flex flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  isActive
                    ? "text-blue-500"
                    : "text-neutral-400"
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
