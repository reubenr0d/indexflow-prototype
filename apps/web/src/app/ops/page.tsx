import type { Metadata } from "next";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import {
  Activity,
  Calendar,
  ExternalLink,
  FileText,
  Gauge,
  Globe,
  LayoutGrid,
  Shield,
  Target,
} from "lucide-react";
import { getOpsSnapshot } from "@/lib/ops.server";
import { DepartmentSummaryGrid } from "@/components/ops/department-summary-grid";
import { ActivityFeed } from "@/components/ops/activity-feed";
import { OpsMission } from "@/components/ops/ops-mission";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Ops · Overview | IndexFlow",
  description:
    "Live manifest of the IndexFlow AI DAO — employees, governance, budgets, and agent heartbeats. Permissionless protocol on-chain. Server-rendered from git.",
  openGraph: {
    title: "IndexFlow AI DAO — live manifest",
    description:
      "Every employee has a manifest entry, a budget cap, and a human-gated approval for any public statement. Server-rendered from the repo.",
    url: "https://indexflow.app/ops",
  },
  twitter: {
    card: "summary_large_image",
    title: "IndexFlow AI DAO — live manifest",
    description:
      "Permissionless protocol on-chain. Live manifest, budgets, and heartbeats — all in git.",
  },
};

export default async function OpsOverviewPage() {
  const snapshot = await getOpsSnapshot();
  const { company } = snapshot;
  const allAgents = [...snapshot.activeEmployees, ...snapshot.outOfScopeAgents];

  return (
    <>
      {company.mission && <OpsMission mission={company.mission} />}

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      {company.strategicPriorities.length > 0 && (
        <section className="mb-10">
          <SectionHeader
            icon={Target}
            title="Strategic priorities"
            subtitle="Frozen goals the company is optimizing for this cycle."
          />
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {company.strategicPriorities.map((p) => (
              <li
                key={p.id}
                className="flex flex-col rounded-lg border border-app-border bg-app-surface p-4"
              >
                <div className="flex items-start gap-2">
                  <Target className="mt-0.5 h-4 w-4 shrink-0 text-app-accent" />
                  <h3 className="text-sm font-semibold leading-snug text-app-text">{p.name}</h3>
                </div>

                {p.horizon && (
                  <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-app-muted">
                    <Calendar className="mt-0.5 h-3 w-3 shrink-0" />
                    <span className="font-mono">{p.horizon}</span>
                  </p>
                )}

                {p.metric && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-app-muted">
                    <Gauge className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{p.metric}</span>
                  </p>
                )}

                {p.sourceDoc && (
                  <div className="mt-auto flex items-center gap-1.5 border-t border-app-border pt-2 font-mono text-[10px] text-app-muted">
                    <FileText className="h-3 w-3 shrink-0" />
                    <span className="truncate">{p.sourceDoc}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-10">
        <SectionHeader
          icon={LayoutGrid}
          title="Departments"
          subtitle="Click into any tab for the full surface."
        />
        <DepartmentSummaryGrid snapshot={snapshot} />
      </section>

      <section className="mb-10 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionHeader
            icon={Activity}
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

          {company.publicSurfaces.length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-app-muted">
                <Globe className="h-4 w-4" />
                <h3 className="text-xs font-semibold uppercase tracking-wider">
                  Public surfaces
                </h3>
              </div>
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
      </div>
    </>
  );
}

function SectionHeader({
  title,
  subtitle,
  icon: Icon,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
}) {
  return (
    <header className="mb-4">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-app-accent" />}
        <h2 className="text-lg font-semibold tracking-tight text-app-text">{title}</h2>
      </div>
      {subtitle && <p className="mt-0.5 text-sm text-app-muted">{subtitle}</p>}
    </header>
  );
}
