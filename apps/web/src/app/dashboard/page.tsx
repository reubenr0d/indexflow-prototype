"use client";

import { useMemo } from "react";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { StatCard } from "@/components/ui/stat-card";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoLabel } from "@/components/ui/info-tooltip";
import { useAllBaskets } from "@/hooks/useBasketFactory";
import { useVaultStateBatch } from "@/hooks/usePerpReader";
import { useBasketsOverviewQuery } from "@/hooks/subgraph/useBasketOverview";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { formatUSDC, formatCompact, formatBps } from "@/lib/format";
import { computeBlendedComposition } from "@/lib/blendedComposition";
import { USDC_PRECISION } from "@/lib/constants";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { type Address } from "viem";

export default function DashboardPage() {
  const subgraph = useBasketsOverviewQuery({ first: 200, skip: 0 });

  const { data: baskets } = useAllBaskets();
  const vaultAddresses = useMemo(() => (baskets as unknown as Address[]) ?? [], [baskets]);
  const { data: vaultStates } = useVaultStateBatch(vaultAddresses);

  const subgraphData = useMemo(
    () => (Array.isArray(subgraph.data) ? subgraph.data : []),
    [subgraph.data]
  );
  const isLoading = subgraph.isLoading;

  const infos = useMemo(
    () =>
      subgraphData.map((item) => ({
        vault: item.vault,
        name: item.name,
        basketPrice: item.basketPrice,
        sharePrice: item.sharePrice,
        totalSupply: item.totalSupply,
        usdcBalance: item.usdcBalance,
        perpAllocated: item.perpAllocated,
      })),
    [subgraphData]
  );

  const openInterestByVault = useMemo(() => {
    const states = (vaultStates as Array<{ result?: { openInterest: bigint }; status: string }> | undefined) ?? [];
    return new Map(
      vaultAddresses.map((vault, i) => [
        vault,
        states[i]?.status === "success" ? states[i]?.result?.openInterest ?? 0n : 0n,
      ])
    );
  }, [vaultAddresses, vaultStates]);

  const totalTVL = useMemo(
    () =>
      infos.reduce(
        (sum, info) => sum + (info.usdcBalance ?? 0n) + (info.perpAllocated ?? 0n),
        0n
      ),
    [infos]
  );

  const sortedBaskets = useMemo(
    () =>
      [...infos]
        .sort((a, b) => {
          const tvlA = (a.usdcBalance ?? 0n) + (a.perpAllocated ?? 0n);
          const tvlB = (b.usdcBalance ?? 0n) + (b.perpAllocated ?? 0n);
          return tvlB > tvlA ? 1 : -1;
        })
        .slice(0, 6),
    [infos]
  );

  return (
    <PageWrapper>
      <div className="mb-12">
        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-12 w-56" />
          </div>
        ) : (
          <div>
            <p className="font-mono text-xs font-medium uppercase tracking-widest text-app-muted">
              Total value locked
            </p>
            <p className="mt-2 font-mono text-4xl font-semibold tracking-tight text-app-text sm:text-5xl">
              {formatCompact(Number(totalTVL / USDC_PRECISION))}
            </p>
          </div>
        )}
      </div>

      <div className="mb-10 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Active baskets"
          value={String(infos.length)}
          isLoading={isLoading}
          tooltipKey="activeBaskets"
        />
        <StatCard
          label="Vaults tracked"
          value={String(infos.length)}
          subValue="Factory index"
          isLoading={isLoading}
          tooltipKey="vaultsTracked"
        />
        <StatCard
          label="Aggregate TVL"
          value={formatCompact(Number(totalTVL / USDC_PRECISION))}
          isLoading={isLoading}
          tooltipKey="aggregateTvl"
        />
      </div>

      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 className="text-lg font-semibold text-app-text">
          <InfoLabel label="Largest baskets" tooltipKey="largestBaskets" />
        </h2>
        <Link
          href="/baskets"
          className="inline-flex items-center gap-1 font-mono text-sm font-medium text-app-accent hover:underline"
        >
          View all <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-5">
              <Skeleton className="mb-2 h-4 w-28" />
              <Skeleton className="h-8 w-24" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sortedBaskets.map((info) => (
            <Link key={info.vault} href={`/baskets/${info.vault}`}>
              {(() => {
                const perpBlendBps = computeBlendedComposition(
                  info.usdcBalance ?? 0n,
                  info.perpAllocated ?? 0n,
                  openInterestByVault.get(info.vault as Address) ?? 0n,
                  []
                ).perpBlendBps;
                return (
              <Card className="h-full p-5 transition-colors hover:border-app-border-strong hover:bg-app-surface-hover">
                <p className="text-sm font-medium text-app-muted">
                  <InfoLabel label={info.name || "Basket"} tooltipKey="tableName" />
                </p>
                <p className="mt-2 font-mono text-xl font-semibold text-app-text">
                  {formatUSDC((info.usdcBalance ?? 0n) + (info.perpAllocated ?? 0n))}
                </p>
                <p className="mt-1 font-mono text-xs text-app-muted">TVL</p>
                <p className="mt-1 text-xs text-app-muted">Perp sleeve {formatBps(perpBlendBps)}</p>
              </Card>
                );
              })()}
            </Link>
          ))}
        </div>
      )}

      {!isLoading && infos.length === 0 && (
        <div className="rounded-lg border border-dashed border-app-border bg-app-surface py-16 text-center">
          <p className="font-medium text-app-text">No baskets deployed</p>
          <p className="mt-2 text-sm text-app-muted">
            Deploy contracts and update addresses in config, or create a basket from the admin panel.
          </p>
          <Link
            href="/admin/baskets"
            className="mt-6 inline-flex items-center rounded-md bg-app-accent px-5 py-2.5 text-sm font-semibold text-app-accent-fg hover:opacity-90"
          >
            Admin: create basket
          </Link>
        </div>
      )}
    </PageWrapper>
  );
}
