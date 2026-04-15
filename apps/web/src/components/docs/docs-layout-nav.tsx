"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DocsManifestEntry } from "@/lib/docs-types";
import { DOCS_CATEGORY_ORDER, type DocsCategory } from "@/lib/docs-types";

export function docsHref(slug: string) {
  return `/docs/${slug}`;
}

function groupByCategory(docs: DocsManifestEntry[]): Map<DocsCategory, DocsManifestEntry[]> {
  const map = new Map<DocsCategory, DocsManifestEntry[]>();
  for (const cat of DOCS_CATEGORY_ORDER) {
    const items = docs.filter((d) => d.category === cat);
    if (items.length > 0) map.set(cat, items);
  }
  return map;
}

function CategorySection({
  category,
  docs,
  pathname,
  defaultOpen,
}: {
  category: DocsCategory;
  docs: DocsManifestEntry[];
  pathname: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-xs font-bold uppercase tracking-wider text-app-muted/70 transition-colors hover:text-app-muted"
      >
        <ChevronRight className={cn("h-3 w-3 transition-transform", open && "rotate-90")} />
        {category}
      </button>
      {open && (
        <div className="ml-2 space-y-0.5 border-l border-app-border/50 pl-2">
          {docs.map((page) => {
            const href = docsHref(page.slug);
            const active = pathname === href;
            return (
              <Link
                key={page.slug}
                href={href}
                className={cn(
                  "block rounded-md px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-app-accent/10 font-medium text-app-accent"
                    : "text-app-muted hover:bg-app-surface hover:text-app-text"
                )}
              >
                {page.title}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DocsLayoutNav({ docs }: { docs: DocsManifestEntry[] }) {
  const pathname = usePathname();
  const grouped = useMemo(() => groupByCategory(docs), [docs]);

  const activeCategoryForPath = useMemo(() => {
    const activeDoc = docs.find((d) => pathname === docsHref(d.slug));
    return activeDoc?.category ?? null;
  }, [docs, pathname]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-app-border bg-app-bg-subtle/50 lg:block">
        <nav className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto p-3">
          <Link
            href="/docs"
            className={cn(
              "mb-3 block rounded-md px-3 py-2 text-sm font-semibold transition-colors",
              pathname === "/docs"
                ? "bg-app-accent/10 text-app-accent"
                : "text-app-muted hover:bg-app-surface hover:text-app-text"
            )}
          >
            Documentation
          </Link>
          <div className="space-y-1">
            {Array.from(grouped.entries()).map(([category, items]) => (
              <CategorySection
                key={category}
                category={category}
                docs={items}
                pathname={pathname}
                defaultOpen={category === activeCategoryForPath || pathname === "/docs"}
              />
            ))}
          </div>
        </nav>
      </aside>

      {/* Mobile horizontal nav */}
      <nav className="sticky top-14 z-20 border-b border-app-border bg-app-surface/95 px-4 py-2 backdrop-blur-md lg:hidden">
        <div className="flex gap-2 overflow-x-auto">
          <Link
            href="/docs"
            className={cn(
              "whitespace-nowrap rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors",
              pathname === "/docs"
                ? "border-app-accent/30 bg-app-accent/10 text-app-accent"
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
                  "whitespace-nowrap rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-app-accent/30 bg-app-accent/10 text-app-accent"
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
