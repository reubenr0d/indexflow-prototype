"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DOCS_PAGES_SORTED, type DocsRoleTag } from "@/lib/wiki";
import { docsHref } from "@/components/docs/docs-layout-nav";
import { cn } from "@/lib/utils";

const roleOptions: Array<"All" | DocsRoleTag> = ["All", "Investor", "Operator", "Gov", "Keeper"];

export const DOCS_START_PATHS = [
  {
    title: "Operator path",
    description: "Start with the system basics, then move into setup, price updates, and pool controls.",
    slugs: ["overview", "operator", "perp-risk-math", "operator-interactions", "oracle-price-sync", "pool-management"] as const,
  },
  {
    title: "Integrator path",
    description: "Learn how deposits work, what the contracts do, and how to recover from common issues.",
    slugs: ["investor", "contracts-reference", "troubleshooting", "security-risk"] as const,
  },
];

export function DocsHomeClient() {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<"All" | DocsRoleTag>("All");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return DOCS_PAGES_SORTED.filter((page) => {
      if (role !== "All" && !page.roleTags.includes(role)) return false;

      if (!q) return true;

      const haystack = [
        page.title,
        page.summary,
        page.audience,
        page.networkContext,
        page.roleTags.join(" "),
        page.overview.join(" "),
        page.guides.join(" "),
        page.reference.join(" "),
        page.flow.map((section) => `${section.title} ${section.items.join(" ")}`).join(" "),
        (page.formulas ?? []).map((item) => `${item.name} ${item.expression} ${item.notes}`).join(" "),
        (page.unitsGlossary ?? []).map((item) => `${item.term} ${item.value} ${item.notes}`).join(" "),
        (page.interactionMatrix ?? [])
          .map((item) =>
            [
              item.contract,
              item.fn,
              item.caller,
              item.inputs.join(" "),
              item.preconditions.join(" "),
              item.stateDeltas.join(" "),
              item.failureRisks.join(" "),
              item.postTxChecks.join(" "),
            ].join(" ")
          )
          .join(" "),
        (page.preflightChecklist ?? []).join(" "),
        (page.postflightChecklist ?? []).join(" "),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [query, role]);

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-app-border bg-app-surface p-5 sm:p-6">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-app-accent">In-App Wiki</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-app-text">Docs And Runbooks</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-app-muted sm:text-base">
          Basket vaults accept USDC, route capital into a shared perp layer, and track liquidity, pricing, and roles across the system.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {DOCS_START_PATHS.map((path) => (
          <article key={path.title} className="rounded-xl border border-app-border bg-app-surface p-5">
            <h2 className="text-lg font-semibold text-app-text">{path.title}</h2>
            <p className="mt-1 text-sm text-app-muted">{path.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {path.slugs.map((slug) => {
                const page = DOCS_PAGES_SORTED.find((item) => item.slug === slug);
                if (!page) return null;
                return (
                  <Link
                    key={slug}
                    href={docsHref(slug)}
                    className="rounded-md border border-app-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-app-text hover:bg-app-bg-subtle"
                  >
                    {page.title}
                  </Link>
                );
              })}
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-xl border border-app-border bg-app-surface p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <label className="block w-full lg:max-w-md">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-app-muted">
              Search Sections
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by workflow, role, contract, or incident"
              className="w-full rounded-md border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text outline-none transition-colors placeholder:text-app-muted focus:border-app-border-strong"
            />
          </label>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-app-muted">Filter By Role</p>
            <div className="flex flex-wrap gap-2">
              {roleOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setRole(option)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide",
                    role === option
                      ? "border-app-border-strong bg-app-bg-subtle text-app-text"
                      : "border-app-border text-app-muted hover:text-app-text"
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {filtered.map((page) => (
            <Link
              key={page.slug}
              href={docsHref(page.slug)}
              className="rounded-xl border border-app-border bg-app-bg p-4 transition-colors hover:bg-app-surface-hover"
            >
              <div className="flex flex-wrap gap-1.5">
                {page.roleTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-sm bg-app-accent-dim px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-app-accent"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <h3 className="mt-3 text-base font-semibold text-app-text">{page.title}</h3>
              <p className="mt-1 text-sm text-app-muted">{page.summary}</p>
              <p className="mt-3 text-xs uppercase tracking-wide text-app-muted">Last updated: {page.lastUpdated}</p>
            </Link>
          ))}
          {filtered.length === 0 && (
            <div className="rounded-xl border border-dashed border-app-border p-6 text-sm text-app-muted">
              No sections match the current search and role filter.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
