"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { DocsManifestEntry } from "@/lib/docs-types";

export function docsHref(slug: string) {
  return `/docs/${slug}`;
}

export function DocsLayoutNav({ docs }: { docs: DocsManifestEntry[] }) {
  const pathname = usePathname();

  return (
    <>
      <aside className="hidden w-64 shrink-0 border-r border-app-border bg-app-bg-subtle/70 lg:block">
        <nav className="sticky top-14 space-y-1 p-3">
          <Link
            href="/docs"
            className={cn(
              "block rounded-md px-3 py-2 text-sm font-semibold",
              pathname === "/docs" ? "bg-app-surface text-app-text" : "text-app-muted hover:bg-app-surface hover:text-app-text"
            )}
          >
            Docs Home
          </Link>
          {docs.map((page) => {
            const href = docsHref(page.slug);
            const active = pathname === href;
            return (
              <Link
                key={page.slug}
                href={href}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm",
                  active ? "bg-app-surface text-app-text" : "text-app-muted hover:bg-app-surface hover:text-app-text"
                )}
              >
                {page.title}
              </Link>
            );
          })}
        </nav>
      </aside>

      <nav className="sticky top-14 z-20 border-b border-app-border bg-app-surface/95 px-4 py-2 backdrop-blur-md lg:hidden">
        <div className="flex gap-2 overflow-x-auto">
          <Link
            href="/docs"
            className={cn(
              "whitespace-nowrap rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide",
              pathname === "/docs"
                ? "border-app-border-strong bg-app-bg-subtle text-app-text"
                : "border-app-border text-app-muted"
            )}
          >
            Home
          </Link>
          {docs.map((page) => {
            const href = docsHref(page.slug);
            const active = pathname === href;
            return (
              <Link
                key={page.slug}
                href={href}
                className={cn(
                  "whitespace-nowrap rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide",
                  active
                    ? "border-app-border-strong bg-app-bg-subtle text-app-text"
                    : "border-app-border text-app-muted"
                )}
              >
                {page.title}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
