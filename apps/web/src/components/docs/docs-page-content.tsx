import Link from "next/link";
import { DOCS_PAGES, type DocsPage } from "@/lib/wiki";
import { docsHref } from "@/components/docs/docs-layout-nav";
import { cn } from "@/lib/utils";

function slugToSourceHref(path: string): string {
  return `https://github.com/reubenr0d/indexflow-prototype/blob/main/${path}`;
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="rounded-sm bg-app-accent-dim px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-app-accent">
      {role}
    </span>
  );
}

function Callout({ tone, title, body }: { tone: "info" | "warning"; title: string; body: string }) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        tone === "warning"
          ? "border-app-warning/40 bg-app-warning/10"
          : "border-app-accent/30 bg-app-accent-dim"
      )}
    >
      <p className="text-sm font-semibold text-app-text">{title}</p>
      <p className="mt-1 text-sm text-app-muted">{body}</p>
    </div>
  );
}

export function DocsPageContent({ page }: { page: DocsPage }) {
  const flowAnchors = page.flow.map((section) => ({
    id: `flow-${section.id}`,
    title: section.title,
  }));

  const toc = [
    { id: "who-is-this-for", title: "Who This Is For" },
    { id: "what-this-section-covers", title: "What You Will Learn" },
    { id: "required-permissions", title: "Who Can Do What" },
    { id: "step-by-step-flow", title: "How It Works" },
    ...flowAnchors,
    { id: "failure-modes", title: "What Can Go Wrong" },
    { id: "related-pages", title: "Related Pages" },
    { id: "source-docs", title: "Source Docs" },
  ];

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_16rem]">
      <article className="space-y-8">
        <header className="rounded-xl border border-app-border bg-app-surface p-5 sm:p-6">
          <div className="flex flex-wrap gap-1.5">
            {page.roleTags.map((tag) => (
              <RoleBadge key={tag} role={tag} />
            ))}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-app-text">{page.title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-app-muted sm:text-base">{page.summary}</p>
          <div className="mt-4 grid gap-3 text-xs uppercase tracking-wide text-app-muted sm:grid-cols-2">
            <p>Last updated: {page.lastUpdated}</p>
            <p>Best for: {page.audience}</p>
          </div>
          <div className="mt-4 rounded-lg border border-app-border bg-app-bg p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-app-muted">Environment Note</p>
            <p className="mt-1 text-sm text-app-muted">{page.networkContext}</p>
          </div>
        </header>

        {page.callouts.map((callout) => (
          <Callout key={callout.title} tone={callout.tone} title={callout.title} body={callout.body} />
        ))}

        <section id="what-this-section-covers" className="space-y-4">
          <h2 className="text-xl font-semibold text-app-text">What You Will Learn</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-app-border bg-app-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-app-muted">Big Picture</p>
              <ul className="mt-3 space-y-2 text-sm text-app-muted">
                {page.overview.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-app-border bg-app-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-app-muted">What To Do</p>
              <ul className="mt-3 space-y-2 text-sm text-app-muted">
                {page.guides.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-app-border bg-app-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-app-muted">Useful Details</p>
              <ul className="mt-3 space-y-2 text-sm text-app-muted">
                {page.reference.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="who-is-this-for" className="space-y-3">
          <h2 className="text-xl font-semibold text-app-text">Who This Is For</h2>
          <p className="text-sm leading-relaxed text-app-muted">{page.audience}</p>
        </section>

        <section id="required-permissions" className="space-y-3">
          <h2 className="text-xl font-semibold text-app-text">Who Can Do What</h2>
          <ul className="space-y-2 text-sm text-app-muted">
            {page.permissions.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </section>

        <section id="step-by-step-flow" className="space-y-4">
          <h2 className="text-xl font-semibold text-app-text">How It Works</h2>
          {page.flow.map((section) => (
            <div key={section.id} id={`flow-${section.id}`} className="rounded-lg border border-app-border bg-app-surface p-4">
              <h3 className="text-base font-semibold text-app-text">{section.title}</h3>
              <ul className="mt-2 space-y-2 text-sm text-app-muted">
                {section.items.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section id="failure-modes" className="space-y-3">
          <h2 className="text-xl font-semibold text-app-text">What Can Go Wrong</h2>
          <ul className="space-y-2 text-sm text-app-muted">
            {page.failureModes.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </section>

        <section id="related-pages" className="space-y-3">
          <h2 className="text-xl font-semibold text-app-text">Related Pages</h2>
          <div className="flex flex-wrap gap-2">
            {page.relatedSlugs.map((slug) => {
              const related = DOCS_PAGES[slug];
              return (
                <Link
                  key={slug}
                  href={docsHref(slug)}
                  className="rounded-md border border-app-border bg-app-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-app-text hover:bg-app-surface-hover"
                >
                  {related.title}
                </Link>
              );
            })}
          </div>
        </section>

        <section id="source-docs" className="space-y-3">
          <h2 className="text-xl font-semibold text-app-text">Source Docs</h2>
          <div className="flex flex-wrap gap-2">
            {page.sourceDocs.map((path) => (
              <a
                key={path}
                href={slugToSourceHref(path)}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-app-border bg-app-surface px-3 py-1.5 font-mono text-xs text-app-muted hover:text-app-text"
              >
                {path}
              </a>
            ))}
          </div>
        </section>

        <footer className="rounded-lg border border-app-border bg-app-bg-subtle p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-app-muted">Keep Reading</p>
          <p className="mt-2 text-sm text-app-muted">
            The pages below explain the adjacent parts of the system that affect this workflow.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {page.relatedSlugs.map((slug) => {
              const related = DOCS_PAGES[slug];
              return (
                <Link
                  key={`footer-${slug}`}
                  href={docsHref(slug)}
                  className="rounded-md border border-app-border bg-app-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-app-text hover:bg-app-surface-hover"
                >
                  {related.title}
                </Link>
              );
            })}
          </div>
        </footer>
      </article>

      <aside className="hidden xl:block">
        <div className="sticky top-20 rounded-lg border border-app-border bg-app-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-app-muted">On This Page</p>
          <nav className="mt-3 space-y-1.5">
            {toc.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="block text-xs font-medium uppercase tracking-wide text-app-muted hover:text-app-text"
              >
                {item.title}
              </a>
            ))}
          </nav>
        </div>
      </aside>
    </div>
  );
}
