import type { Metadata } from "next";
import { getOpsSnapshot } from "@/lib/ops.server";
import { BudgetsTable } from "@/components/ops/budgets-table";
import { OpsPageHeader } from "@/components/ops/ops-page-header";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Treasury · Ops | IndexFlow",
  description:
    "Monthly USD caps per employee. 100% spend auto-pauses the agent; 80% surfaces a soft warning. All caps in COMPANY.md.",
  openGraph: {
    title: "IndexFlow Treasury",
    description: "Budget caps per employee — committed in git, enforced by Paperclip.",
    url: "https://indexflow.app/ops/treasury",
  },
};

export default async function TreasuryPage() {
  const snapshot = await getOpsSnapshot();
  const repoUrl = snapshot.company.sourceRepo;
  const { budgets } = snapshot.company;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <OpsPageHeader
        eyebrow="Treasury"
        title="Budget caps per employee"
        description="Every active employee carries a monthly USD cap committed in git. The Paperclip runtime enforces them: 100% spend auto-pauses the employee, 80% surfaces a soft warning. Caps for brainstormed agents only activate on promotion."
        sourceRepo={repoUrl}
        sourceFile="COMPANY.md#budgets"
        sourceLabel="COMPANY.md (Budgets)"
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <SummaryTile label="Active monthly" value={`$${budgets.totalActive.toLocaleString()}`} sub={`${budgets.cycle} cycle · ${budgets.defaultCurrency}`} />
        <SummaryTile label="If all promoted" value={`$${budgets.totalIfAllPromoted.toLocaleString()}`} sub="brainstorm + active" />
        <SummaryTile label="Employees with caps" value={String(budgets.active.length + budgets.proposedOnPromotion.length)} sub={`${budgets.active.length} active · ${budgets.proposedOnPromotion.length} proposed`} />
      </div>

      <BudgetsTable budgets={budgets} />
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
