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
    (t) => t !== "anvil" && t !== "arbitrum",
  ).length;
  const isAllChains = viewMode === "all";

  return (
    <div className="mt-10 border-t border-app-border pt-6">
      <div className="inline-flex items-center gap-2 rounded-full border border-app-border bg-app-surface px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-app-accent">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
        </span>
        Live testnet stats
        {isAllChains && (
          <span className="ml-1 normal-case tracking-normal text-app-muted">
            across {configuredTargets.length} chains
          </span>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-10">
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
        <p className="mt-3 text-xs text-red-400">
          Unable to load stats from the subgraph — data may be stale.
        </p>
      )}
      <p className="mt-4 max-w-3xl text-xs leading-relaxed text-app-muted">
        These metrics reflect the current testnet deployment and are shown for
        product preview purposes, not live mainnet capital.
      </p>
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
        <span className="mt-0.5 h-6 w-16 animate-pulse rounded bg-app-surface" />
      ) : (
        <span className="mt-0.5 font-mono text-base font-semibold text-app-text">
          {value}
        </span>
      )}
    </div>
  );
}
