import type { Metadata } from "next";
import { getOpsSnapshot } from "@/lib/ops.server";
import { AgentCard } from "@/components/ops/agent-card";
import { OpsPageHeader } from "@/components/ops/ops-page-header";
import { ContentCalendarStrip } from "@/components/ops/content-calendar-strip";
import { PartnershipsStrip } from "@/components/ops/partnerships-strip";
import { BasketConceptsStrip } from "@/components/ops/basket-concepts-strip";
import { PublishedStrip } from "@/components/ops/published-strip";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Growth / CMO · Ops | IndexFlow",
  description:
    "The CMO function split across four agents: editorial, events, product-marketing, BD ops. Plus the live content calendar, partnerships pipeline, basket concepts, and posted receipts.",
  openGraph: {
    title: "IndexFlow Growth / CMO",
    description: "Four agents covering the CMO role with founder-gated public posting.",
    url: "https://indexflow.app/ops/growth",
  },
};

export default async function GrowthPage() {
  const snapshot = await getOpsSnapshot();
  const repoUrl = snapshot.company.sourceRepo;
  const isGrowth = (a: { team?: string; kind?: string }) =>
    a.team === "growth" || a.kind === "growth";
  // Several CMO agents have been promoted from `Brainstorm` to `Active` in
  // COMPANY.md (partnership-tracker, basket-ideator, content-publisher as of
  // 2026-05). Pull from both buckets so the page reflects the full CMO surface
  // rather than just the brainstorm column. Active first so the page leads
  // with what's currently shipping.
  const growthAgents = [
    ...snapshot.activeEmployees.filter(isGrowth),
    ...snapshot.brainstormEmployees.filter(isGrowth),
  ];

  return (
    <div>
      <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
        <OpsPageHeader
          eyebrow="Growth / CMO"
          title="The CMO role, split across four agents"
          description="Editorial (content-publisher), events (broadcast-bot), product-marketing (basket-ideator), BD ops (partnership-tracker). Each has scope, budget, and a human gate before anything is said publicly."
          sourceRepo={repoUrl}
          sourceFile="COMPANY.md#brainstorm-proposed-for-review"
          sourceLabel="COMPANY.md (Brainstorm)"
        />

        {growthAgents.length === 0 ? (
          <EmptyState message="No growth agents in the manifest yet." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {growthAgents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} repoUrl={repoUrl} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-12 border-y border-app-border bg-app-bg-subtle">
        <div className="mx-auto max-w-6xl px-4 pb-2 pt-10 sm:px-6">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-app-accent">
            CMO surface
          </p>
          <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-app-text">
            What the marketing engine looks like, also in git.
          </h2>
        </div>
        <ContentCalendarStrip rows={snapshot.contentCalendar} repoUrl={repoUrl} />
        <PartnershipsStrip rows={snapshot.partnerships} repoUrl={repoUrl} />
        <BasketConceptsStrip concepts={snapshot.basketConcepts} repoUrl={repoUrl} />
        <div className="pb-6">
          <PublishedStrip
            postedRows={snapshot.contentCalendar}
            recentBlogPosts={snapshot.recentBlogPosts}
          />
        </div>
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
