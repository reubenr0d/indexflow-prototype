import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Shield } from "lucide-react";
import { getOpsSnapshot } from "@/lib/ops.server";
import { DepartmentSummaryGrid } from "@/components/ops/department-summary-grid";
import { ActivityFeed } from "@/components/ops/activity-feed";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Ops · Overview | IndexFlow",
  description:
    "Public mirror of the IndexFlow Agent Company — manifest, employees, governance, budgets, heartbeats. Permissionless protocol on-chain. Transparent operating company in git.",
  openGraph: {
    title: "IndexFlow Agent Company — built in public",
    description:
      "Every employee has a manifest entry, a budget cap, and a human-gated approval for any public statement. Server-rendered from the repo.",
    url: "https://indexflow.app/ops",
  },
  twitter: {
    card: "summary_large_image",
    title: "IndexFlow Agent Company — built in public",
    description:
      "Permissionless protocol on-chain. Transparent operating company in git.",
  },
};

export default async function OpsOverviewPage() {
  const snapshot = await getOpsSnapshot();
  const { company } = snapshot;
  const allAgents = [...snapshot.activeEmployees, ...snapshot.outOfScopeAgents];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      {company.mission && (
        <section className="mb-10 max-w-3xl">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-app-muted">
            Mission
          </p>
          <p className="mt-2 text-base leading-relaxed text-app-text">{company.mission}</p>
        </section>
      )}

      <section className="mb-10">
        <SectionHeader title="Departments" subtitle="Click into any tab for the full surface." />
        <DepartmentSummaryGrid snapshot={snapshot} />
      </section>

      <section className="mb-10 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionHeader
            title="Latest activity"
            subtitle="Most recent agent heartbeats across every department, with risk-officer verdicts."
          />
          <ActivityFeed agents={allAgents} limit={8} />
        </div>

        <aside className="space-y-6">
          <div className="rounded-lg border border-app-border bg-app-bg-subtle p-4">
            <div className="flex items-center gap-2 text-app-muted">
              <Shield className="h-4 w-4" />
              <h3 className="text-xs font-semibold uppercase tracking-wider">Governance</h3>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-app-muted">
              {company.hardConstraints.length} hard constraints, {company.approvalsRequired.length}{" "}
              founder-approval gates. Every employee, every heartbeat.
            </p>
            <Link
              href="/ops/risk"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-app-accent hover:underline"
            >
              See Risk & Policy →
            </Link>
          </div>

          {company.strategicPriorities.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-app-muted">
                Strategic priorities
              </h3>
              <ul className="mt-3 space-y-2">
                {company.strategicPriorities.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-md border border-app-border bg-app-surface px-3 py-2"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-app-text">{p.name}</span>
                      {p.horizon && (
                        <span className="font-mono text-[10px] uppercase tracking-wider text-app-muted">
                          {p.horizon}
                        </span>
                      )}
                    </div>
                    {p.metric && (
                      <div className="mt-0.5 text-[11px] text-app-muted">{p.metric}</div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {company.publicSurfaces.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-app-muted">
                Public surfaces
              </h3>
              <ul className="mt-3 space-y-1">
                {company.publicSurfaces.map((s) => (
                  <li key={s.surface} className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-app-muted">{s.surface}</span>
                    {s.url ? (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-app-text hover:text-app-accent"
                      >
                        {s.value}
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    ) : (
                      <span className="font-mono text-app-text">{s.value}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </section>

      {company.board.length > 0 && (
        <section>
          <SectionHeader
            title="Board"
            subtitle="Roles held simultaneously while the company is one founder + a fleet of agents."
          />
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {company.board.map((member) => (
              <li
                key={`${member.role}-${member.name}`}
                className="rounded-lg border border-app-border bg-app-surface p-4"
              >
                <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-app-accent">
                  {member.role}
                </div>
                <div className="mt-1 text-sm font-semibold text-app-text">{member.name}</div>
                {member.titles && member.titles.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1">
                    {member.titles.map((title) => (
                      <li
                        key={title}
                        className="rounded-full border border-app-border bg-app-bg px-1.5 py-0.5 font-mono text-[10px] text-app-muted"
                      >
                        {title}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-4">
      <h2 className="text-lg font-semibold tracking-tight text-app-text">{title}</h2>
      {subtitle && <p className="mt-0.5 text-sm text-app-muted">{subtitle}</p>}
    </header>
  );
}
