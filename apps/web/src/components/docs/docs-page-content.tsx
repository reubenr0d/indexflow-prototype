import type { DocsDocument, DocsNavItem } from "@/lib/docs-types";
import { DocsMarkdownContent } from "@/components/docs/docs-markdown-content";
import { DocsToc } from "@/components/docs/docs-toc";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";

function docsHref(slug: string) {
  return `/docs/${slug}`;
}

function sourceHref(path: string): string {
  return `https://github.com/reubenr0d/indexflow-prototype/blob/main/${path}`;
}

function Breadcrumbs({ doc }: { doc: DocsDocument }) {
  return (
    <nav className="flex items-center gap-1.5 text-xs text-app-muted" aria-label="Breadcrumb">
      <a href="/docs" className="transition-colors hover:text-app-text">
        Docs
      </a>
      <span className="text-app-border-strong">/</span>
      <span className="text-app-muted/70">{doc.category}</span>
      <span className="text-app-border-strong">/</span>
      <span className="text-app-text">{doc.title}</span>
    </nav>
  );
}

function PrevNextNav({ prev, next }: { prev: DocsNavItem | null; next: DocsNavItem | null }) {
  if (!prev && !next) return null;
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2">
      {prev ? (
        <a
          href={docsHref(prev.slug)}
          className="group flex items-center gap-3 rounded-lg border border-app-border bg-app-surface p-4 transition-colors hover:border-app-accent/40"
        >
          <ArrowLeft className="h-4 w-4 shrink-0 text-app-muted transition-colors group-hover:text-app-accent" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-app-muted">Previous</p>
            <p className="truncate text-sm font-medium text-app-text">{prev.title}</p>
          </div>
        </a>
      ) : (
        <div />
      )}
      {next ? (
        <a
          href={docsHref(next.slug)}
          className="group flex items-center justify-end gap-3 rounded-lg border border-app-border bg-app-surface p-4 text-right transition-colors hover:border-app-accent/40"
        >
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-app-muted">Next</p>
            <p className="truncate text-sm font-medium text-app-text">{next.title}</p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-app-muted transition-colors group-hover:text-app-accent" />
        </a>
      ) : (
        <div />
      )}
    </div>
  );
}

export function DocsPageContent({
  doc,
  prev,
  next,
}: {
  doc: DocsDocument;
  prev: DocsNavItem | null;
  next: DocsNavItem | null;
}) {
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem]">
      <article className="min-w-0 space-y-6">
        <Breadcrumbs doc={doc} />

        <header>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-app-accent">
            {doc.category}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-app-text sm:text-4xl">
            {doc.title}
          </h1>
          <p className="mt-3 text-base leading-relaxed text-app-muted">{doc.summary}</p>
          {doc.slug !== doc.canonicalSlug && (
            <div className="mt-4 rounded-lg border border-app-warning/40 bg-app-warning/10 p-3 text-sm text-app-muted">
              This is a legacy docs route alias. Canonical path:{" "}
              <a className="text-app-accent underline" href={docsHref(doc.canonicalSlug)}>
                {docsHref(doc.canonicalSlug)}
              </a>
            </div>
          )}
        </header>

        {/* Mobile TOC (below xl) */}
        <DocsToc toc={doc.toc} variant="mobile" />

        <section id="content">
          <DocsMarkdownContent markdown={doc.content} />
        </section>

        <footer className="flex items-center justify-between rounded-lg border border-app-border/50 bg-app-bg-subtle/40 px-4 py-3">
          <p className="text-xs text-app-muted">
            Last updated {doc.lastUpdated}
          </p>
          <a
            href={sourceHref(doc.relativePath)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-app-muted transition-colors hover:text-app-text"
          >
            View source
            <ExternalLink className="h-3 w-3" />
          </a>
        </footer>

        <PrevNextNav prev={prev} next={next} />
      </article>

      {/* Desktop TOC sidebar */}
      <aside className="hidden xl:block">
        <DocsToc toc={doc.toc} variant="desktop" />
      </aside>
    </div>
  );
}
