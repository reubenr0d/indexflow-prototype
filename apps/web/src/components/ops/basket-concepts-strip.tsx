import { Lightbulb, ExternalLink } from "lucide-react";
import type { BasketConcept } from "@/lib/ops-types";

interface BasketConceptsStripProps {
  concepts: BasketConcept[];
  repoUrl: string;
}

export function BasketConceptsStrip({ concepts, repoUrl }: BasketConceptsStripProps) {
  if (concepts.length === 0) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-app-muted">
          <Lightbulb className="h-4 w-4" />
          <h2 className="text-xs font-semibold uppercase tracking-wider">
            Basket concepts queue
          </h2>
        </div>
        <a
          href={`${repoUrl}/blob/main/growth/basket-concepts/REGISTRY.md`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-app-muted transition-colors hover:text-app-text"
        >
          <ExternalLink className="h-3 w-3" />
          Registry
        </a>
      </header>
      <p className="mt-2 text-sm text-app-muted">
        The front of the Season 1 flywheel — themes proposed by `basket-ideator`
        (or humans), reviewed by the founder, then handed off to the trading
        agent flow for deployment.
      </p>
      <ul className="mt-5 grid gap-3 md:grid-cols-2">
        {concepts.map((c) => (
          <li
            key={c.slug}
            className="rounded-lg border border-app-border bg-app-surface p-4"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-app-text">{c.theme}</h3>
              <span className="text-[10px] font-mono uppercase tracking-wider text-app-muted">
                {c.status}
              </span>
            </div>
            <div className="mt-1 font-mono text-xs text-app-muted">
              proposed {c.proposedDate} · {c.assetCount} asset{c.assetCount === 1 ? "" : "s"}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-app-text">{c.rationale}</p>
            <a
              href={`${repoUrl}/blob/main/${c.filePath}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-xs text-app-muted transition-colors hover:text-app-text"
            >
              <ExternalLink className="h-3 w-3" />
              {c.filePath.split("/").pop()}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
