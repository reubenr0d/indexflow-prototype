import type { Metadata } from "next";
import { getOpsSnapshot } from "@/lib/ops.server";
import { AgentCard } from "@/components/ops/agent-card";
import { GovernanceStrip } from "@/components/ops/governance-strip";
import { OpsPageHeader } from "@/components/ops/ops-page-header";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Risk & Policy · Ops | IndexFlow",
  description:
    "Hard constraints, founder-approval gates, and prompt-only second-pass reviewers that vet every write batch before broadcast.",
  openGraph: {
    title: "IndexFlow Risk & Policy",
    description: "How the agent fleet stays inside the rails — constraints, gates, reviewers.",
    url: "https://indexflow.app/ops/risk",
  },
};

export default async function RiskPage() {
  const snapshot = await getOpsSnapshot();
  const repoUrl = snapshot.company.sourceRepo;
  const promptOnly = snapshot.activeEmployees.filter((a) => a.kind === "prompt-only");

  return (
    <div>
      <GovernanceStrip company={snapshot.company} />

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <OpsPageHeader
          eyebrow="Risk & Policy"
          title="Prompt-only second-pass reviewers"
          description="No heartbeat of their own. Invoked inline by sibling scripts as the system prompt for a per-batch LLM verdict (approve / downsize / veto). The last line of defence before any write reaches a public surface."
          sourceRepo={repoUrl}
          sourceFile="COMPANY.md#active-in-paperclip"
          sourceLabel="COMPANY.md (Active)"
        />

        {promptOnly.length === 0 ? (
          <EmptyState message="No prompt-only reviewers in the manifest yet." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {promptOnly.map((agent) => (
              <AgentCard key={agent.id} agent={agent} repoUrl={repoUrl} />
            ))}
          </div>
        )}
      </div>
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
