"use client";

import { useMemo } from "react";
import { Activity, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { ChainDistributionChart } from "@/components/chains/chain-visualizations";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { usePoolReserveRegistryState } from "@/hooks/usePoolReserveRegistry";

function formatFreshness(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "--";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export default function ChainsPage() {
  const { chains, isLoading: registryLoading, isEmpty, failedTargets } = usePoolReserveRegistryState();

  const metrics = useMemo(() => {
    if (chains.length === 0) {
      return {
        activeChains: 0,
        weightSum: 0,
        weightHealthy: false,
        staleChains: 0,
        freshestUpdateSec: Number.NaN,
      };
    }

    const weightSum = chains.reduce((sum, c) => sum + c.routingWeight, 0);
    const staleChains = chains.filter((c) => c.staleness > 300).length;
    const freshestUpdateSec = Math.min(...chains.map((c) => c.staleness));

    return {
      activeChains: chains.length,
      weightSum,
      weightHealthy: weightSum === 10_000,
      staleChains,
      freshestUpdateSec,
    };
  }, [chains]);

  return (
    <PageWrapper>
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-app-text">Cross-Chain Coordination</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-app-muted">
          Monitor keeper-posted routing state across deployed chains. Deposit acceptance and pricing consistency
          depend on fresh StateRelay updates.
        </p>
        {failedTargets.length > 0 && (
          <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Showing partial chain data. Failed subgraph targets: {failedTargets.join(", ")}.
          </p>
        )}
      </div>

      <section aria-label="Relay metrics" className="mb-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Active chains" value={String(metrics.activeChains)} isLoading={registryLoading} icon={Activity} />
          <StatCard
            label="Weight sum"
            value={`${(metrics.weightSum / 100).toFixed(2)}%`}
            isLoading={registryLoading}
            icon={metrics.weightHealthy ? CheckCircle : AlertTriangle}
          />
          <StatCard
            label="Stale chains (>5m)"
            value={`${metrics.staleChains}`}
            isLoading={registryLoading}
            icon={Clock}
          />
          <StatCard
            label="Latest keeper update"
            value={formatFreshness(metrics.freshestUpdateSec)}
            isLoading={registryLoading}
            icon={Clock}
          />
        </div>
      </section>

      {chains.length > 0 && (
        <section aria-label="Chain distribution" className="mb-10">
          <ChainDistributionChart chains={chains} />
        </section>
      )}

      {isEmpty && (
        <section aria-label="Chain distribution empty state" className="mb-10">
          <Card className="p-8">
            <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-app-border bg-app-surface">
                <Activity className="h-5 w-5 text-app-accent" />
              </div>
              <p className="text-base font-medium text-app-text">No relay state indexed yet</p>
              <p className="max-w-md text-sm text-app-muted">
                {registryLoading
                  ? "Loading state relay updates..."
                  : "Once subgraphs index StateRelay updates, this view will populate automatically."}
              </p>
            </div>
          </Card>
        </section>
      )}
    </PageWrapper>
  );
}
