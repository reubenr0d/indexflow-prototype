import { Shield, ExternalLink } from "lucide-react";
import type { CompanyManifest } from "@/lib/ops-types";

interface GovernanceStripProps {
  company: CompanyManifest;
}

const CONSTRAINT_ICON: Record<string, string> = {
  never_auto_commit: "🚫",
  deployment_memory_allowlist: "📒",
  public_channel_human_gate: "🗣️",
  scope_boundary: "🛟",
};

export function GovernanceStrip({ company }: GovernanceStripProps) {
  if (company.hardConstraints.length === 0) return null;
  return (
    <section className="border-y border-app-border bg-app-bg-subtle">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex items-center gap-2 text-app-muted">
          <Shield className="h-4 w-4" />
          <h2 className="text-xs font-semibold uppercase tracking-wider">
            Hard constraints (every employee, every heartbeat)
          </h2>
        </div>
        <ul className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {company.hardConstraints.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-app-border bg-app-surface p-3"
            >
              <div className="font-mono text-xs font-semibold uppercase tracking-wider text-app-text">
                <span className="mr-1">{CONSTRAINT_ICON[c.id] ?? "·"}</span>
                {c.id.replace(/_/g, " ")}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-app-muted">{c.description}</p>
            </li>
          ))}
        </ul>

        {company.approvalsRequired.length > 0 && (
          <div className="mt-6">
            <div className="text-xs font-semibold uppercase tracking-wider text-app-muted">
              Founder-approval gates
            </div>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {company.approvalsRequired.map((a) => (
                <li
                  key={a}
                  className="rounded-md border border-app-border bg-app-bg px-2 py-0.5 font-mono text-[11px] text-app-text"
                >
                  {a}
                </li>
              ))}
            </ul>
          </div>
        )}

        <a
          href={`${company.sourceRepo}/blob/main/AGENTS.md`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-1 text-xs text-app-muted transition-colors hover:text-app-text"
        >
          <ExternalLink className="h-3 w-3" />
          Full policy in AGENTS.md
        </a>
      </div>
    </section>
  );
}
