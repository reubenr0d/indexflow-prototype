import { GitCommit, ExternalLink } from "lucide-react";
import type { CompanyManifest } from "@/lib/ops-types";

interface SourcesFooterProps {
  company: CompanyManifest;
  generatedAt: string;
}

const SOURCES: Array<{ path: string; label: string }> = [
  { path: "COMPANY.md", label: "Manifest, employees, governance, budgets" },
  { path: "AGENT_DEPLOYMENT_MEMORY.md", label: "Deployment ledger" },
  { path: "AGENTS.md", label: "Repo-wide agent policy" },
  { path: "agents/memory/", label: "Heartbeats + state + run-logs per agent" },
  { path: "apps/web/public/agent-metadata/", label: "Per-vault AI Operator metadata" },
  { path: "growth/X_CONTENT_CALENDAR.md", label: "Season 1 X schedule" },
  { path: "growth/partnerships/", label: "Per-partner files + master pipeline" },
  { path: "growth/basket-concepts/queue/", label: "Basket concept proposals" },
  { path: "docs/AGENTS_FRAMEWORK.md", label: "Agent fleet architecture" },
  { path: "content/blog/", label: "Long-form narrative" },
];

export function SourcesFooter({ company, generatedAt }: SourcesFooterProps) {
  return (
    <section className="border-t border-app-border bg-app-bg-subtle">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex items-center gap-2 text-app-muted">
          <GitCommit className="h-4 w-4" />
          <h2 className="text-xs font-semibold uppercase tracking-wider">
            This page is generated from these files
          </h2>
        </div>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {SOURCES.map((s) => (
            <li key={s.path}>
              <a
                href={`${company.sourceRepo}/blob/main/${s.path}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-baseline gap-2 rounded-md border border-transparent px-2 py-1.5 transition-colors hover:border-app-border hover:bg-app-surface"
              >
                <ExternalLink className="h-3 w-3 shrink-0 text-app-muted transition-colors group-hover:text-app-text" />
                <span className="min-w-0">
                  <span className="font-mono text-xs text-app-text">{s.path}</span>
                  <span className="ml-2 text-xs text-app-muted">{s.label}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xs text-app-muted">
          Snapshot rendered at {new Date(generatedAt).toISOString()}. Page revalidates every 60 seconds via Next ISR.
        </p>
      </div>
    </section>
  );
}
