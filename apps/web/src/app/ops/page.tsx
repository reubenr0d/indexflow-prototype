import type { Metadata } from "next";
import { getOpsSnapshot } from "@/lib/ops.server";
import { OpsHero } from "@/components/ops/ops-hero";
import { AgentCard } from "@/components/ops/agent-card";
import { GovernanceStrip } from "@/components/ops/governance-strip";
import { BudgetsTable } from "@/components/ops/budgets-table";
import { ContentCalendarStrip } from "@/components/ops/content-calendar-strip";
import { PartnershipsStrip } from "@/components/ops/partnerships-strip";
import { BasketConceptsStrip } from "@/components/ops/basket-concepts-strip";
import { DeploymentsStrip } from "@/components/ops/deployments-strip";
import { PublishedStrip } from "@/components/ops/published-strip";
import { SourcesFooter } from "@/components/ops/sources-footer";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Agent Company | IndexFlow",
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

export default async function OpsPage() {
  const snapshot = await getOpsSnapshot();
  const repoUrl = snapshot.company.sourceRepo;

  const tradingAgents = snapshot.outOfScopeAgents.filter((a) => a.kind === "trading" || a.vault);
  const metaAgents = snapshot.activeEmployees.filter((a) => a.kind === "meta");
  const promptOnly = snapshot.activeEmployees.filter((a) => a.kind === "prompt-only");
  const growthAgents = snapshot.brainstormEmployees.filter((a) => a.team === "growth" || a.kind === "growth");

  return (
    <main>
      <OpsHero snapshot={snapshot} />

      <GovernanceStrip company={snapshot.company} />

      {tradingAgents.length > 0 && (
        <Section
          title="Trading agents — repo-managed, vault-bound"
          subtitle="One vault each. Frozen mandate in the system prompt. Every write action passes a risk-officer second-pass. Out of Paperclip scope by design."
          repoUrl={repoUrl}
          sourceFile="COMPANY.md#out-of-scope-managed-via-the-repo-not-paperclip"
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {tradingAgents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} repoUrl={repoUrl} />
            ))}
          </div>
        </Section>
      )}

      {metaAgents.length > 0 && (
        <Section
          title="Engineering meta-agents — Paperclip scope"
          subtitle="Self-improvement loop: speculative issues → human triage → drafted PRs → human merge. Never auto-commits."
          repoUrl={repoUrl}
          sourceFile="COMPANY.md#employees"
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {metaAgents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} repoUrl={repoUrl} />
            ))}
          </div>
        </Section>
      )}

      {growthAgents.length > 0 && (
        <Section
          title="Growth & CMO function — distributed across 4 agents"
          subtitle="The CMO role is split into editorial (content-publisher), events (broadcast-bot), product-marketing (basket-ideator), and BD ops (partnership-tracker). Each has scope, budget, and human gates."
          repoUrl={repoUrl}
          sourceFile="COMPANY.md#brainstorm-proposed-for-review"
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {growthAgents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} repoUrl={repoUrl} />
            ))}
          </div>
        </Section>
      )}

      {promptOnly.length > 0 && (
        <Section
          title="Prompt-only reviewers"
          subtitle="No heartbeat. Invoked inline by sibling scripts as the system prompt for a per-batch LLM verdict (approve / downsize / veto)."
          repoUrl={repoUrl}
          sourceFile="COMPANY.md#active-in-paperclip"
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {promptOnly.map((agent) => (
              <AgentCard key={agent.id} agent={agent} repoUrl={repoUrl} />
            ))}
          </div>
        </Section>
      )}

      <BudgetsTable budgets={snapshot.company.budgets} />

      <div className="border-t border-app-border bg-app-bg-subtle">
        <div className="mx-auto max-w-6xl px-4 pb-2 pt-12 sm:px-6">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.24em] text-app-accent">
            CMO surface
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-app-text">
            What the marketing engine looks like, also in git.
          </h2>
        </div>
      </div>

      <div className="bg-app-bg-subtle">
        <ContentCalendarStrip rows={snapshot.contentCalendar} repoUrl={repoUrl} />
      </div>
      <div className="bg-app-bg-subtle">
        <PartnershipsStrip rows={snapshot.partnerships} repoUrl={repoUrl} />
      </div>
      <div className="bg-app-bg-subtle">
        <BasketConceptsStrip concepts={snapshot.basketConcepts} repoUrl={repoUrl} />
      </div>
      <div className="bg-app-bg-subtle pb-6">
        <PublishedStrip
          postedRows={snapshot.contentCalendar}
          recentBlogPosts={snapshot.recentBlogPosts}
        />
      </div>

      <DeploymentsStrip rows={snapshot.deployments} repoUrl={repoUrl} />

      <SourcesFooter company={snapshot.company} generatedAt={snapshot.generatedAt} />
    </main>
  );
}

interface SectionProps {
  title: string;
  subtitle: string;
  repoUrl: string;
  sourceFile: string;
  children: React.ReactNode;
}

function Section({ title, subtitle, repoUrl, sourceFile, children }: SectionProps) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <header className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight text-app-text">{title}</h2>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-app-muted">{subtitle}</p>
        <a
          href={`${repoUrl}/blob/main/${sourceFile}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block font-mono text-[11px] text-app-muted underline-offset-2 hover:text-app-text hover:underline"
        >
          src · {sourceFile.split("#")[0]}
        </a>
      </header>
      {children}
    </section>
  );
}
