import type { Metadata } from "next";
import { getOpsSnapshot } from "@/lib/ops.server";
import { DeploymentsStrip } from "@/components/ops/deployments-strip";
import { OpsPageHeader } from "@/components/ops/ops-page-header";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Infrastructure · Ops | IndexFlow",
  description:
    "Deployment ledger — what cloud and on-chain infrastructure exists, who owns it, and what actions are allowed. Read from AGENT_DEPLOYMENT_MEMORY.md.",
  openGraph: {
    title: "IndexFlow Infrastructure",
    description: "The deployment allowlist agents must check before touching any resource.",
    url: "https://indexflow.app/ops/infrastructure",
  },
};

export default async function InfrastructurePage() {
  const snapshot = await getOpsSnapshot();
  const repoUrl = snapshot.company.sourceRepo;

  const agentOwned = snapshot.deployments.filter((d) => d.owner === "agent").length;
  const planned = snapshot.deployments.filter((d) => d.planned).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <OpsPageHeader
        eyebrow="Infrastructure"
        title="Deployment ledger"
        description="The allowlist agents must check before touching any cloud or on-chain resource. Agents may only read/update what's listed; anything else is treated as protected."
        sourceRepo={repoUrl}
        sourceFile="AGENT_DEPLOYMENT_MEMORY.md"
        sourceLabel="AGENT_DEPLOYMENT_MEMORY.md"
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <SummaryTile label="Tracked resources" value={String(snapshot.deployments.length)} sub="active rows (superseded hidden)" />
        <SummaryTile label="Agent-owned" value={String(agentOwned)} sub="agents may deploy / update" />
        <SummaryTile label="Planned" value={String(planned)} sub="proposed, not yet provisioned" />
      </div>

      <DeploymentsStrip rows={snapshot.deployments} repoUrl={repoUrl} />
    </div>
  );
}

interface SummaryTileProps {
  label: string;
  value: string;
  sub: string;
}

function SummaryTile({ label, value, sub }: SummaryTileProps) {
  return (
    <div className="rounded-lg border border-app-border bg-app-surface p-4">
      <div className="text-[10px] font-medium uppercase tracking-wider text-app-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-app-text">{value}</div>
      <div className="mt-0.5 text-[11px] text-app-muted">{sub}</div>
    </div>
  );
}
