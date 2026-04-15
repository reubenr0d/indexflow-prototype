"use client";

import { useMemo } from "react";
import {
  Activity,
  CheckCircle,
  Clock,
  DollarSign,
  Plane,
  RotateCcw,
  Send,
} from "lucide-react";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { ChainDistributionChart } from "@/components/chains/chain-visualizations";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { InfoLabel } from "@/components/ui/info-tooltip";
import { usePoolReserveRegistryState } from "@/hooks/usePoolReserveRegistry";
import { useRecentIntents, type RecentIntent } from "@/hooks/useIntentRouter";
import { formatUSDC } from "@/lib/format";
import { TOOLTIP_COPY } from "@/lib/tooltip-copy";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

const STATUS_BADGE: Record<string, { label: string; className: string; icon: LucideIcon }> = {
  pending: { label: "Pending", className: "bg-yellow-500/10 text-yellow-600", icon: Clock },
  executed: { label: "Executed", className: "bg-green-500/10 text-green-600", icon: CheckCircle },
  refunded: { label: "Refunded", className: "bg-red-500/10 text-red-600", icon: RotateCcw },
  in_flight: { label: "In Flight", className: "bg-blue-500/10 text-blue-600", icon: Plane },
};

function IntentRow({ intent }: { intent: RecentIntent }) {
  const badge = STATUS_BADGE[intent.status] ?? STATUS_BADGE.pending;
  const BadgeIcon = badge.icon;
  const timeAgo = Math.max(0, Math.floor(Date.now() / 1000) - intent.createdAt);
  const timeLabel =
    timeAgo < 60 ? `${timeAgo}s ago` : timeAgo < 3600 ? `${Math.floor(timeAgo / 60)}m ago` : `${Math.floor(timeAgo / 3600)}h ago`;

  return (
    <tr className="border-b border-app-border last:border-0">
      <td className="py-2.5 pr-3 font-mono text-xs text-app-muted">#{intent.intentId}</td>
      <td className="py-2.5 pr-3 text-xs text-app-text">{intent.intentType}</td>
      <td className="py-2.5 pr-3 font-mono text-xs text-app-text">{formatUSDC(intent.amount)}</td>
      <td className="py-2.5 pr-3">
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium", badge.className)}>
          <BadgeIcon className="h-3 w-3" />
          {badge.label}
        </span>
      </td>
      <td className="py-2.5 pr-3 font-mono text-[11px] text-app-muted" title={intent.user}>
        {intent.user.slice(0, 6)}...{intent.user.slice(-4)}
      </td>
      <td className="py-2.5 text-right text-xs text-app-muted">{timeLabel}</td>
    </tr>
  );
}

export default function ChainsPage() {
  const { chains, isLoading: registryLoading, isPlaceholder } = usePoolReserveRegistryState();
  const { intents, stats, isLoading: intentsLoading } = useRecentIntents();

  const pendingIntents = useMemo(() => intents.filter((i) => i.status === "pending").length, [intents]);

  return (
    <PageWrapper>
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-app-text">Cross-Chain Coordination</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-app-muted">
          Compare pool depth and routing weights across execution chains. Intent activity appears below once intents are
          submitted to the coordination layer.
        </p>
        {isPlaceholder && (
          <p className="mt-3 rounded-md border border-app-border bg-app-surface px-3 py-2 text-xs leading-relaxed text-app-muted">
            Showing placeholder registry data for layout preview. Connect to a deployment with an active subgraph to see
            live data.
          </p>
        )}
      </div>

      {/* Chain distribution + per-chain details (merged) */}
      {chains.length > 0 && (
        <section aria-label="Chain distribution" className="mb-10">
          <ChainDistributionChart chains={chains} />
        </section>
      )}

      {/* Intent activity */}
      <section aria-label="Intent activity">
        <h2 className="mb-4 text-lg font-semibold text-app-text">
          <InfoLabel label="Intent activity" tooltipKey="intentStatus" />
        </h2>

        <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label="Pending intents"
            value={String(pendingIntents)}
            isLoading={intentsLoading}
            tooltipKey="coordPendingIntents"
            icon={Clock}
          />
          {stats && (
            <>
              <StatCard label="Total submitted" value={String(stats.totalSubmitted)} isLoading={intentsLoading} icon={Send} />
              <StatCard label="Total executed" value={String(stats.totalExecuted)} isLoading={intentsLoading} icon={CheckCircle} />
              <StatCard label="Total refunded" value={String(stats.totalRefunded)} isLoading={intentsLoading} icon={RotateCcw} />
              <StatCard label="Cumulative volume" value={formatUSDC(stats.cumulativeVolumeUsdc)} isLoading={intentsLoading} icon={DollarSign} />
            </>
          )}
        </div>

        {intents.length > 0 ? (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[600px] text-left">
              <thead>
                <tr className="border-b border-app-border">
                  <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-app-muted">ID</th>
                  <th className="py-2.5 pr-3 text-[11px] font-medium uppercase tracking-wider text-app-muted">Type</th>
                  <th className="py-2.5 pr-3 text-[11px] font-medium uppercase tracking-wider text-app-muted">Amount</th>
                  <th className="py-2.5 pr-3 text-[11px] font-medium uppercase tracking-wider text-app-muted">Status</th>
                  <th className="py-2.5 pr-3 text-[11px] font-medium uppercase tracking-wider text-app-muted">User</th>
                  <th className="py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-app-muted">Time</th>
                </tr>
              </thead>
              <tbody className="px-4">
                {intents.map((intent) => (
                  <IntentRow key={intent.id} intent={intent} />
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <Card className="p-8">
            <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-app-border bg-app-surface">
                <Activity className="h-5 w-5 text-app-accent" />
              </div>
              <p className="text-base font-medium text-app-text">No intent activity yet</p>
              <p className="max-w-md text-sm text-app-muted">{TOOLTIP_COPY.intentStatus}</p>
            </div>
          </Card>
        )}
      </section>
    </PageWrapper>
  );
}
