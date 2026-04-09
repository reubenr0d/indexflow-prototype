"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { docsHref } from "@/components/docs/docs-layout-nav";
import type { DocsManifestEntry } from "@/lib/docs-types";

export function DocsHomeClient({ docs }: { docs: DocsManifestEntry[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docs;

    return docs.filter((doc) => {
      const haystack = [doc.title, doc.summary, doc.relativePath, doc.fileName, ...doc.aliases].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [docs, query]);

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-app-border bg-app-surface p-5 sm:p-6">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-app-accent">Repository Docs</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-app-text">Docs And Runbooks</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-app-muted sm:text-base">
          This section mirrors the markdown files in the repository <code className="rounded bg-app-bg px-1 py-0.5">docs/</code> directory.
        </p>
      </section>

      <section className="rounded-xl border border-app-border bg-app-surface p-5 sm:p-6">
        <label className="block w-full lg:max-w-md">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-app-muted">Search Docs</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by title, path, or keyword"
            className="w-full rounded-md border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text outline-none transition-colors placeholder:text-app-muted focus:border-app-border-strong"
          />
        </label>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {filtered.map((doc) => (
            <Link
              key={doc.slug}
              href={docsHref(doc.slug)}
              className="rounded-xl border border-app-border bg-app-bg p-4 transition-colors hover:bg-app-surface-hover"
            >
              <h3 className="text-base font-semibold text-app-text">{doc.title}</h3>
              <p className="mt-1 text-sm text-app-muted">{doc.summary}</p>
              <p className="mt-3 font-mono text-xs text-app-muted">{doc.relativePath}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-app-muted">Last updated: {doc.lastUpdated}</p>
            </Link>
          ))}
          {filtered.length === 0 && (
            <div className="rounded-xl border border-dashed border-app-border p-6 text-sm text-app-muted">
              No docs match the current query.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
