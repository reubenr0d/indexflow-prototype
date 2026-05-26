import { ExternalLink, GitBranch, ScrollText, Users } from "lucide-react";
import type { OpsSnapshot } from "@/lib/ops-types";

interface OpsCompactHeaderProps {
  snapshot: OpsSnapshot;
}

function formatRelative(iso: string | undefined): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

export function OpsCompactHeader({ snapshot }: OpsCompactHeaderProps) {
  const { activeEmployees, brainstormEmployees, outOfScopeAgents, company } = snapshot;
  const activeWithVault = [...activeEmployees, ...outOfScopeAgents].filter((e) => e.vault?.address);
  const lastHeartbeat = [...activeEmployees, ...outOfScopeAgents]
    .map((e) => e.heartbeat?.finishedAt)
    .filter((d): d is string => Boolean(d))
    .sort()
    .pop();

  return (
    <section className="border-b border-app-border bg-gradient-to-b from-app-accent/5 to-transparent">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-app-accent">
              Live Manifest · v0.3
            </p>
            <h1 className="mt-1.5 text-2xl font-bold leading-tight tracking-tight text-app-text sm:text-3xl">
              IndexFlow AI DAO
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-app-muted">
              Permissionless protocol on-chain. Live manifest, budgets, and heartbeats — all in git.
            </p>
          </div>
          <a
            href={`${company.sourceRepo}/blob/main/COMPANY.md`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-app-border bg-app-surface px-3 py-1.5 text-xs font-medium text-app-muted transition-colors hover:border-app-border-strong hover:text-app-text"
          >
            <ExternalLink className="h-3 w-3" />
            COMPANY.md
          </a>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <StatPill
            icon={Users}
            label="Employees"
            value={String(activeEmployees.length + outOfScopeAgents.length)}
            sub={`${brainstormEmployees.length} brainstorm`}
          />
          <StatPill
            icon={ScrollText}
            label="Live vaults"
            value={String(activeWithVault.length)}
            sub="trading agents"
          />
          <StatPill
            icon={GitBranch}
            label="Last heartbeat"
            value={formatRelative(lastHeartbeat)}
            sub={lastHeartbeat ? new Date(lastHeartbeat).toISOString().slice(0, 10) : ""}
          />
          <StatPill
            icon={ExternalLink}
            label="Snapshot"
            value={new Date(snapshot.generatedAt).toISOString().slice(11, 16) + "Z"}
            sub="ISR 60s"
          />
        </div>
      </div>
    </section>
  );
}

interface StatPillProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
}

function StatPill({ icon: Icon, label, value, sub }: StatPillProps) {
  return (
    <div className="rounded-lg border border-app-border bg-app-surface px-3 py-2">
      <div className="flex items-center gap-1.5 text-app-muted">
        <Icon className="h-3 w-3" />
        <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-1 text-lg font-semibold leading-tight text-app-text">{value}</div>
      {sub && <div className="text-[11px] text-app-muted">{sub}</div>}
    </div>
  );
}
