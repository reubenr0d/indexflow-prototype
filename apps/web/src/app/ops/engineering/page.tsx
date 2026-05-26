import type { Metadata } from "next";
import { ArrowRight, Bug, GitPullRequest, Hammer } from "lucide-react";
import { getOpsSnapshot } from "@/lib/ops.server";
import { AgentCard } from "@/components/ops/agent-card";
import { OpsPageHeader } from "@/components/ops/ops-page-header";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Engineering · Ops | IndexFlow",
  description:
    "Self-improvement loop meta-agents. Speculative issues → human triage → drafted PRs → human merge. Never auto-commits.",
  openGraph: {
    title: "IndexFlow Engineering meta-agents",
    description: "Meta-agents that propose and draft repo improvements without ever auto-committing.",
    url: "https://indexflow.org/ops/engineering",
  },
};

export default async function EngineeringPage() {
  const snapshot = await getOpsSnapshot();
  const repoUrl = snapshot.company.sourceRepo;
  const metaAgents = snapshot.activeEmployees.filter((a) => a.kind === "meta");

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <OpsPageHeader
        eyebrow="Engineering"
        title="Meta-agents — Paperclip scope"
        description="The self-improvement loop: speculative issues → human triage → drafted PRs → human merge. No auto-commits anywhere in the pipeline."
        sourceRepo={repoUrl}
        sourceFile="docs/AGENTS_FRAMEWORK.md"
        sourceLabel="docs/AGENTS_FRAMEWORK.md"
      />

      <section className="mb-8 rounded-lg border border-app-border bg-app-bg-subtle p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-app-muted">
          Self-improvement loop
        </h3>
        <ol className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <LoopStep icon={Bug} label="Propose" detail="self-improver-issues drafts speculative GitHub issues per CI tick." />
          <LoopArrow />
          <LoopStep icon={GitPullRequest} label="Triage" detail="Human reviews issues. `/agent implement` triggers issue-implementer." />
          <LoopArrow />
          <LoopStep icon={Hammer} label="Draft PR" detail="issue-implementer scopes a PR. Risk-officer approves the manifest." />
          <LoopArrow />
          <LoopStep icon={GitPullRequest} label="Merge" detail="Human merges. Nothing lands on main without a person clicking it." />
        </ol>
      </section>

      {metaAgents.length === 0 ? (
        <EmptyState message="No meta-agents in the manifest yet." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {metaAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} repoUrl={repoUrl} />
          ))}
        </div>
      )}
    </div>
  );
}

interface LoopStepProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  detail: string;
}

function LoopStep({ icon: Icon, label, detail }: LoopStepProps) {
  return (
    <li className="flex flex-1 flex-col rounded-md border border-app-border bg-app-surface p-3">
      <div className="flex items-center gap-2 text-app-accent">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-app-text">{detail}</p>
    </li>
  );
}

function LoopArrow() {
  return (
    <li
      aria-hidden
      className="hidden items-center justify-center text-app-muted sm:flex"
    >
      <ArrowRight className="h-4 w-4" />
    </li>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-app-border bg-app-bg-subtle p-8 text-center">
      <p className="text-sm text-app-muted">{message}</p>
    </div>
  );
}
