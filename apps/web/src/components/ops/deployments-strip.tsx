import { Server } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeploymentRow } from "@/lib/ops-types";

interface DeploymentsStripProps {
  rows: DeploymentRow[];
  repoUrl: string;
}

function isInteresting(row: DeploymentRow): boolean {
  // Filter to a manageable public view — favour cloud services, planned
  // resources, and named integrations. Skip the dozens of supersededs and
  // the noisy chain-by-chain smart-contract rows.
  if (row.superseded) return false;
  if (row.resourceType.toLowerCase().includes("smart contract")) return false;
  return true;
}

export function DeploymentsStrip({ rows, repoUrl }: DeploymentsStripProps) {
  const interesting = rows.filter(isInteresting);
  if (interesting.length === 0) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <header className="flex items-center gap-2 text-app-muted">
        <Server className="h-4 w-4" />
        <h2 className="text-xs font-semibold uppercase tracking-wider">
          Deployment ledger — what infra exists and who owns it
        </h2>
      </header>
      <p className="mt-2 max-w-2xl text-sm text-app-muted">
        Read from{" "}
        <a
          href={`${repoUrl}/blob/main/AGENT_DEPLOYMENT_MEMORY.md`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-app-text underline-offset-2 hover:underline"
        >
          AGENT_DEPLOYMENT_MEMORY.md
        </a>{" "}
        — the allowlist agents must check before touching any cloud or on-chain
        resource. Smart-contract rows omitted here; see the file for the full ledger.
      </p>
      <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {interesting.map((row, i) => (
          <article
            key={`${row.resourceName}-${i}`}
            className={cn(
              "rounded-lg border bg-app-surface p-4",
              row.planned
                ? "border-app-warning/30"
                : row.owner === "agent"
                  ? "border-app-success/30"
                  : "border-app-border",
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-app-text">{row.resourceName}</div>
                <div className="font-mono text-[11px] text-app-muted">
                  {row.provider} · {row.resourceType}
                </div>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                  row.planned
                    ? "border-app-warning/40 bg-app-warning/10 text-app-warning"
                    : row.owner === "agent"
                      ? "border-app-success/40 bg-app-success/10 text-app-success"
                      : "border-app-border bg-app-bg-subtle text-app-muted",
                )}
              >
                {row.planned ? "planned" : row.owner}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-app-text line-clamp-4">{row.purpose}</p>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-app-muted">
              <span className="font-mono">{row.environment}</span>
              <span>·</span>
              <span className="font-mono">{row.allowedActions}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
