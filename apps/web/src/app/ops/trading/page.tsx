import type { Metadata } from "next";
import { getOpsSnapshot } from "@/lib/ops.server";
import { AgentCard } from "@/components/ops/agent-card";
import { OpsPageHeader } from "@/components/ops/ops-page-header";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Trading Desk · Ops | IndexFlow",
  description:
    "Repo-managed trading agents. One vault each, frozen mandate, risk-officer second-pass on every write.",
  openGraph: {
    title: "IndexFlow Trading Desk",
    description: "Vault-bound agents with frozen mandates and live heartbeats.",
    url: "https://indexflow.app/ops/trading",
  },
};

export default async function TradingDeskPage() {
  const snapshot = await getOpsSnapshot();
  const repoUrl = snapshot.company.sourceRepo;
  const tradingAgents = snapshot.outOfScopeAgents.filter(
    (a) => a.kind === "trading" || a.vault,
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <OpsPageHeader
        eyebrow="Trading Desk"
        title="Repo-managed, vault-bound trading agents"
        description="One vault each. Frozen mandate in the system prompt. Every write action passes a risk-officer second-pass before broadcast. Out of Paperclip scope by design."
        sourceRepo={repoUrl}
        sourceFile="COMPANY.md#out-of-scope-managed-via-the-repo-not-paperclip"
        sourceLabel="COMPANY.md (Out of scope)"
      />

      {tradingAgents.length === 0 ? (
        <EmptyState message="No trading agents in the manifest yet." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {tradingAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} repoUrl={repoUrl} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-app-border bg-app-bg-subtle p-8 text-center">
      <p className="text-sm text-app-muted">{message}</p>
    </div>
  );
}
