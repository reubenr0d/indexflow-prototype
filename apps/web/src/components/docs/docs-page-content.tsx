import type { DocsDocument } from "@/lib/docs-types";
import { DocsMarkdownContent } from "@/components/docs/docs-markdown-content";
import { docsHref } from "@/components/docs/docs-layout-nav";

function sourceHref(path: string): string {
  return `https://github.com/reubenr0d/indexflow-prototype/blob/main/${path}`;
}

export function DocsPageContent({ doc }: { doc: DocsDocument }) {
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_16rem]">
      <article className="space-y-8">
        <header className="rounded-xl border border-app-border bg-app-surface p-5 sm:p-6">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-app-accent">Repository Docs</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-app-text">{doc.title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-app-muted sm:text-base">{doc.summary}</p>
          <div className="mt-4 grid gap-3 text-xs uppercase tracking-wide text-app-muted sm:grid-cols-2">
            <p>Source: {doc.relativePath}</p>
            <p>Last updated: {doc.lastUpdated}</p>
          </div>
          {doc.slug !== doc.canonicalSlug && (
            <div className="mt-4 rounded-lg border border-app-warning/40 bg-app-warning/10 p-3 text-sm text-app-muted">
              This is a legacy docs route alias. Canonical path:{" "}
              <a className="text-app-accent underline" href={docsHref(doc.canonicalSlug)}>
                {docsHref(doc.canonicalSlug)}
              </a>
            </div>
          )}
        </header>

        <section id="content" className="rounded-xl border border-app-border bg-app-surface p-5 sm:p-6">
          <DocsMarkdownContent markdown={doc.content} />
        </section>

        <footer className="rounded-lg border border-app-border bg-app-bg-subtle p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-app-muted">Source</p>
          <a
            href={sourceHref(doc.relativePath)}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex rounded-md border border-app-border bg-app-surface px-3 py-1.5 font-mono text-xs text-app-muted hover:text-app-text"
          >
            {doc.relativePath}
          </a>
        </footer>
      </article>

      <aside className="hidden xl:block">
        <div className="sticky top-20 rounded-lg border border-app-border bg-app-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-app-muted">On This Page</p>
          <nav className="mt-3 space-y-1.5">
            {doc.toc.map((item) => (
              <a
                key={`${item.id}-${item.depth}`}
                href={`#${item.id}`}
                className="block text-xs font-medium uppercase tracking-wide text-app-muted hover:text-app-text"
                style={{ paddingLeft: `${Math.max(item.depth - 1, 0) * 10}px` }}
              >
                {item.text}
              </a>
            ))}
          </nav>
        </div>
      </aside>
    </div>
  );
}
