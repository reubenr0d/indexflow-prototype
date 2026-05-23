"use client";

import { useReadContract } from "wagmi";
import { OracleAdapterABI } from "@/abi/OracleAdapter";
import { getContracts, CONFIGURED_DEPLOYMENT_TARGETS } from "@/config/contracts";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { useHeroProtocolStats } from "@/hooks/useHeroProtocolStats";
import { formatApy } from "@/lib/apy";
import { formatCompact, formatSignedCompact } from "@/lib/format";
import { REFETCH_INTERVAL, USDC_PRECISION } from "@/lib/constants";

export default function HeroStats() {
  const { totalTvl, totalPnL, totalApy, basketCount, tokenHolderCount, isLoading, isError } =
    useHeroProtocolStats();
  const { chainId, viewMode, configuredTargets } = useDeploymentTarget();
  const { oracleAdapter } = getContracts(chainId);
  const { data: assetCount, isLoading: assetCountLoading } = useReadContract({
    address: oracleAdapter,
    abi: OracleAdapterABI,
    functionName: "getAssetCount",
    query: { refetchInterval: REFETCH_INTERVAL },
  });
  const assets = assetCount != null ? Number(assetCount) : null;
  const chainCount = CONFIGURED_DEPLOYMENT_TARGETS.filter(
    (t) => t !== "arbitrum",
  ).length;
  const isAllChains = viewMode === "all";

  return (
    <div className="mt-6 border-t border-app-border pt-4">
      <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500/70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
        </span>
        Live testnet stats
        {isAllChains && (
          <span className="ml-1 normal-case tracking-normal text-amber-700/70 dark:text-amber-300/70">
            across {configuredTargets.length} chains
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-7 gap-y-3 sm:gap-x-9">
        <StatCell
          label="Total TVL"
          loading={isLoading}
          value={
            totalTvl != null
              ? formatCompact(Number(totalTvl / USDC_PRECISION))
              : "--"
          }
        />
        <StatCell
          label="Total PnL"
          loading={isLoading}
          value={
            totalPnL != null
              ? formatSignedCompact(Number(totalPnL / USDC_PRECISION))
              : "--"
          }
        />
        <StatCell label="Total APY" loading={isLoading} value={formatApy(totalApy)} />
        <StatCell
          label="Baskets"
          loading={isLoading}
          value={basketCount != null ? String(basketCount) : "--"}
        />
        <StatCell label="Chains" value={String(chainCount)} />
        <StatCell
          label="Assets tracked"
          loading={assetCountLoading}
          value={assets != null ? String(assets) : "--"}
        />
        <StatCell
          label="Tokenholders"
          loading={isLoading}
          value={tokenHolderCount != null ? String(tokenHolderCount) : "--"}
        />
      </div>
      {isError && (
        <p className="mt-2 text-xs text-red-400">
          Unable to load stats from the indexer — data may be stale.
        </p>
      )}
    </div>
  );
}

function StatCell({
  label,
  value,
  loading,
}: {
  label: string;
  value: string;
  loading?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">
        {label}
      </span>
      {loading ? (
        <span className="mt-0.5 h-5 w-14 animate-pulse rounded bg-app-surface" />
      ) : (
        <span className="mt-0.5 font-mono text-sm font-semibold text-app-text sm:text-base">
          {value}
        </span>
      )}
    </div>
  );
}
