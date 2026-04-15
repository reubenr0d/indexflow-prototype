"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { docsHref } from "@/components/docs/docs-layout-nav";
import type { DocsManifestEntry } from "@/lib/docs-types";
import { DOCS_CATEGORY_ORDER, type DocsCategory } from "@/lib/docs-types";

function groupByCategory(docs: DocsManifestEntry[]): Map<DocsCategory, DocsManifestEntry[]> {
  const map = new Map<DocsCategory, DocsManifestEntry[]>();
  for (const cat of DOCS_CATEGORY_ORDER) {
    const items = docs.filter((d) => d.category === cat);
    if (items.length > 0) map.set(cat, items);
  }
  return map;
}

const CATEGORY_DESCRIPTIONS: Record<DocsCategory, string> = {
  "Core Concepts": "Protocol architecture, investor flows, and share pricing mechanics.",
  "Guides": "Step-by-step runbooks for operators and asset managers.",
  "Infrastructure": "Oracle feeds, deployments, and pool management.",
  "Operations": "Testing, notifications, and operational tooling.",
  "Protocol": "Tokenomics, governance, and regulatory considerations.",
};

export function DocsHomeClient({ docs }: { docs: DocsManifestEntry[] }) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<DocsCategory | null>(null);

  const filtered = useMemo(() => {
    let result = docs;
    if (activeCategory) {
      result = result.filter((d) => d.category === activeCategory);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter((doc) => {
        const haystack = [doc.title, doc.summary, doc.relativePath, doc.fileName, ...doc.aliases].join(" ").toLowerCase();
        return haystack.includes(q);
      });
    }
    return result;
  }, [docs, query, activeCategory]);

  const grouped = useMemo(() => groupByCategory(filtered), [filtered]);
  const isSearching = query.trim().length > 0;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <header className="border-b border-app-border pb-8">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-app-accent">
          IndexFlow
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-app-text sm:text-4xl">
          Documentation
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-app-muted">
          Technical documentation for the IndexFlow protocol — basket vaults, perpetual liquidity, oracle infrastructure, and operator guides.
        </p>
      </header>

      {/* Search and category filters */}
      <div className="space-y-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search docs..."
            className="w-full rounded-lg border border-app-border bg-app-surface py-2.5 pl-10 pr-4 text-sm text-app-text outline-none transition-colors placeholder:text-app-muted/60 focus:border-app-accent/40 focus:ring-1 focus:ring-app-accent/20"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory(null)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              activeCategory === null
                ? "border-app-accent/30 bg-app-accent/10 text-app-accent"
                : "border-app-border text-app-muted hover:text-app-text"
            }`}
          >
            All
          </button>
          {DOCS_CATEGORY_ORDER.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                activeCategory === cat
                  ? "border-app-accent/30 bg-app-accent/10 text-app-accent"
                  : "border-app-border text-app-muted hover:text-app-text"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grouped doc cards */}
      {isSearching ? (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((doc) => (
            <DocCard key={doc.slug} doc={doc} />
          ))}
          {filtered.length === 0 && <EmptyState />}
        </div>
      ) : (
        <div className="space-y-10">
          {Array.from(grouped.entries()).map(([category, items]) => (
            <section key={category}>
              <div className="mb-4 border-b border-app-border pb-3">
                <h2 className="text-lg font-semibold text-app-text">{category}</h2>
                <p className="mt-0.5 text-sm text-app-muted">{CATEGORY_DESCRIPTIONS[category]}</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {items.map((doc) => (
                  <DocCard key={doc.slug} doc={doc} />
                ))}
              </div>
            </section>
          ))}
          {grouped.size === 0 && <EmptyState />}
        </div>
      )}
    </div>
  );
}

function DocCard({ doc }: { doc: DocsManifestEntry }) {
  return (
    <Link
      href={docsHref(doc.slug)}
      className="group rounded-lg border border-app-border bg-app-surface p-4 transition-all hover:border-app-accent/30 hover:bg-app-surface-hover"
    >
      <h3 className="text-sm font-semibold text-app-text group-hover:text-app-accent">
        {doc.title}
      </h3>
      <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-app-muted">{doc.summary}</p>
      <p className="mt-3 text-[11px] text-app-muted/60">{doc.lastUpdated}</p>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="col-span-full rounded-lg border border-dashed border-app-border p-8 text-center text-sm text-app-muted">
      No docs match the current filter.
    </div>
  );
}
