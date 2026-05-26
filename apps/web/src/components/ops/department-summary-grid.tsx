import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Code2,
  Megaphone,
  Server,
  Shield,
  Wallet,
} from "lucide-react";
import type { EmployeeCard, OpsSnapshot } from "@/lib/ops-types";

interface DepartmentSummaryGridProps {
  snapshot: OpsSnapshot;
}

interface DeptCard {
  href: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  agents: EmployeeCard[];
  caption: string;
  metricLabel: string;
  metricValue: string;
}

function latestHeartbeat(agents: EmployeeCard[]): string | undefined {
  return agents
    .map((a) => a.heartbeat?.finishedAt)
    .filter((d): d is string => Boolean(d))
    .sort()
    .pop();
}

function formatRelative(iso: string | undefined): string {
  if (!iso) return "no heartbeats yet";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

export function DepartmentSummaryGrid({ snapshot }: DepartmentSummaryGridProps) {
  const tradingAgents = snapshot.outOfScopeAgents.filter(
    (a) => a.kind === "trading" || a.vault,
  );
  const engineeringAgents = snapshot.activeEmployees.filter((a) => a.kind === "meta");
  const growthAgents = snapshot.brainstormEmployees.filter(
    (a) => a.team === "growth" || a.kind === "growth",
  );
  const riskAgents = snapshot.activeEmployees.filter((a) => a.kind === "prompt-only");

  const liveVaults = tradingAgents.filter((a) => a.vault?.address).length;

  const cards: DeptCard[] = [
    {
      href: "/ops/trading",
      title: "Trading Desk",
      icon: Activity,
      agents: tradingAgents,
      caption: "Vault-bound agents with frozen mandates and risk-officer second-pass.",
      metricLabel: "live vaults",
      metricValue: String(liveVaults),
    },
    {
      href: "/ops/engineering",
      title: "Engineering",
      icon: Code2,
      agents: engineeringAgents,
      caption: "Self-improvement loop: speculative issues → human triage → drafted PRs.",
      metricLabel: "meta-agents",
      metricValue: String(engineeringAgents.length),
    },
    {
      href: "/ops/growth",
      title: "Growth / CMO",
      icon: Megaphone,
      agents: growthAgents,
      caption: "Editorial, events, product-marketing, and BD ops — four agents, one CMO surface.",
      metricLabel: "growth agents",
      metricValue: String(growthAgents.length),
    },
    {
      href: "/ops/risk",
      title: "Risk & Policy",
      icon: Shield,
      agents: riskAgents,
      caption: "Hard constraints, founder-approval gates, and prompt-only second-pass reviewers.",
      metricLabel: "constraints",
      metricValue: String(snapshot.company.hardConstraints.length),
    },
    {
      href: "/ops/treasury",
      title: "Treasury",
      icon: Wallet,
      agents: [],
      caption: "Monthly USD caps per employee. 100% spend auto-pauses. 80% surfaces a warning.",
      metricLabel: "active monthly cap",
      metricValue: `$${snapshot.company.budgets.totalActive.toLocaleString()}`,
    },
    {
      href: "/ops/infrastructure",
      title: "Infrastructure",
      icon: Server,
      agents: [],
      caption: "Deployment ledger — what cloud and on-chain resources exist and who owns them.",
      metricLabel: "tracked resources",
      metricValue: String(snapshot.deployments.length),
    },
  ];

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => {
        const last = card.agents.length ? latestHeartbeat(card.agents) : undefined;
        return (
          <li key={card.href}>
            <Link
              href={card.href}
              className="group flex h-full flex-col rounded-lg border border-app-border bg-app-surface p-4 transition-colors hover:border-app-border-strong"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <card.icon className="h-4 w-4 text-app-accent" />
                  <h3 className="text-sm font-semibold text-app-text">{card.title}</h3>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-app-muted transition-transform group-hover:translate-x-0.5 group-hover:text-app-text" />
              </div>
              <p className="mt-2 flex-1 text-xs leading-relaxed text-app-muted">{card.caption}</p>
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-app-border pt-2 text-[11px] text-app-muted">
                <span>
                  <span className="font-mono tabular-nums text-app-text">{card.metricValue}</span>{" "}
                  {card.metricLabel}
                </span>
                {card.agents.length > 0 && (
                  <span className="font-mono">last: {formatRelative(last)}</span>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
