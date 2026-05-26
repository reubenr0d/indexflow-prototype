import type { OpsSnapshot } from "@/lib/ops-types";
import { ExternalLink, GitBranch, ScrollText, Users } from "lucide-react";

interface OpsHeroProps {
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

export function OpsHero({ snapshot }: OpsHeroProps) {
  const { activeEmployees, brainstormEmployees, outOfScopeAgents, company } = snapshot;
  const activeWithVault = [...activeEmployees, ...outOfScopeAgents].filter((e) => e.vault?.address);
  const lastHeartbeat = [...activeEmployees, ...outOfScopeAgents]
    .map((e) => e.heartbeat?.finishedAt)
    .filter((d): d is string => Boolean(d))
    .sort()
    .pop();

  return (
    <section className="border-b border-app-border bg-gradient-to-b from-app-accent/5 to-transparent">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.24em] text-app-accent">
          Live Manifest · v{company.budgets.cycle ? "0.3" : "0.3"}
        </p>
        <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-app-text sm:text-4xl lg:text-5xl">
          IndexFlow AI DAO
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-relaxed text-app-muted sm:text-lg">
          Permissionless protocol on-chain. Live manifest, budgets, and heartbeats — all in git.
          Every employee — human or AI — has a manifest entry, a budget cap, and
          a human-gated approval for any public statement. This page is
          server-rendered from the repo files listed at the bottom.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Users}
            label="Active employees"
            value={String(activeEmployees.length + outOfScopeAgents.length)}
            sub={`${brainstormEmployees.length} brainstormed`}
          />
          <StatCard
            icon={ScrollText}
            label="Live vaults"
            value={String(activeWithVault.length)}
            sub="trading agents"
          />
          <StatCard
            icon={GitBranch}
            label="Last heartbeat"
            value={formatRelative(lastHeartbeat)}
            sub={lastHeartbeat ? new Date(lastHeartbeat).toISOString().slice(0, 10) : ""}
          />
          <StatCard
            icon={ExternalLink}
            label="Source"
            value="COMPANY.md"
            sub="see footer for all files"
            href={`${company.sourceRepo}/blob/main/COMPANY.md`}
          />
        </div>
      </div>
    </section>
  );
}

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  href?: string;
}

function StatCard({ icon: Icon, label, value, sub, href }: StatCardProps) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-app-muted">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-app-text">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-app-muted">{sub}</div>}
    </>
  );
  const cls =
    "block rounded-lg border border-app-border bg-app-surface p-4 transition-colors hover:border-app-border-strong";
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {body}
      </a>
    );
  }
  return <div className={cls}>{body}</div>;
}
