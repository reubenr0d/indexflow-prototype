"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { type Address } from "viem";
import { computeApy } from "@/lib/apy";
import { USDC_PRECISION } from "@/lib/constants";
import { type DeploymentTarget } from "@/lib/deployment";
import { GET_BASKETS_OVERVIEW, GET_TOKEN_HOLDER_ADDRESSES } from "@/lib/subgraph/queries";
import { getSubgraphClientForTarget } from "@/lib/subgraph/client";
import { toBasketOverviewRows } from "@/lib/subgraph/transform";
import { useBasketsOverviewQuery, type BasketOverview } from "@/hooks/subgraph/useBasketOverview";
import { useBasketsWeekSnapshots } from "@/hooks/subgraph/useBasketTrends";
import { useVaultPnLBatch } from "@/hooks/usePerpReader";
import { DEFAULT_PAGE_SIZE, useAvailableSubgraph } from "@/hooks/subgraph/useSubgraphShared";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";

type RawTokenHolderPosition = {
  id: string;
  user?: { id: string } | null;
};

type ChainBasketsResult = {
  baskets: BasketOverview[];
  target: DeploymentTarget;
};

function useSingleChainHeroStats() {
  const { client, isAvailable } = useAvailableSubgraph();
  const {
    data: baskets,
    isLoading: basketsLoading,
    isError: basketsError,
  } = useBasketsOverviewQuery({ first: 500, skip: 0 });

  const vaults = useMemo(() => (baskets ?? []).map((basket) => basket.vault as Address), [baskets]);
  const vaultPnL = useVaultPnLBatch(vaults);
  const weekSnapshots = useBasketsWeekSnapshots(vaults);
  const tokenHolders = useQuery({
    queryKey: ["subgraph", "tokenHolderAddresses"],
    queryFn: async () => {
      if (!client) return null;

      const holderIds = new Set<string>();
      let skip = 0;

      while (true) {
        const result = await client.request<{ userBasketPositions: RawTokenHolderPosition[] }>(
          GET_TOKEN_HOLDER_ADDRESSES,
          { first: DEFAULT_PAGE_SIZE, skip }
        );
        const rows = result.userBasketPositions ?? [];
        rows.forEach((row) => {
          if (row.user?.id) {
            holderIds.add(row.user.id.toLowerCase());
          }
        });
        if (rows.length < DEFAULT_PAGE_SIZE) break;
        skip += DEFAULT_PAGE_SIZE;
      }

      return holderIds.size;
    },
    enabled: isAvailable,
    staleTime: 15_000,
    retry: 1,
  });

  const totalTvl = useMemo(() => {
    if (!baskets) return null;
    return baskets.reduce(
      (sum, basket) => sum + (basket.usdcBalance ?? 0n) + (basket.perpAllocated ?? 0n),
      0n
    );
  }, [baskets]);

  const totalPnL = useMemo(() => {
    if (!baskets) return null;
    if (vaults.length === 0) return 0n;
    if (!vaultPnL.data) return null;

    return vaultPnL.data.reduce((sum, row) => {
      const result =
        row.status === "success" ? (row.result as [bigint, bigint] | undefined) : undefined;
      return sum + (result?.[0] ?? 0n) + (result?.[1] ?? 0n);
    }, 0n);
  }, [baskets, vaultPnL.data, vaults.length]);

  const totalApy = useMemo(() => {
    if (!baskets) return null;
    if (vaults.length === 0) return 0;
    if (!weekSnapshots.data) return null;

    let weightedApy = 0;
    let totalWeight = 0;

    for (const basket of baskets) {
      const vault = basket.vault.toLowerCase() as Address;
      const snapshot = weekSnapshots.data.get(vault);
      if (!snapshot?.current || !snapshot.previous) continue;

      const apy = computeApy(snapshot.current.sharePrice, snapshot.previous.sharePrice, 7);
      if (apy === null) continue;

      const tvl = Number(
        ((basket.usdcBalance ?? 0n) + (basket.perpAllocated ?? 0n)) / USDC_PRECISION
      );
      if (tvl <= 0) continue;

      weightedApy += apy * tvl;
      totalWeight += tvl;
    }

    return totalWeight > 0 ? weightedApy / totalWeight : null;
  }, [baskets, vaults.length, weekSnapshots.data]);

  return {
    basketCount: baskets?.length ?? null,
    tokenHolderCount: tokenHolders.data ?? null,
    totalTvl,
    totalPnL,
    totalApy,
    isLoading:
      basketsLoading || vaultPnL.isLoading || weekSnapshots.isLoading || tokenHolders.isLoading,
    isError: basketsError || tokenHolders.isError,
  };
}

async function fetchChainBaskets(target: DeploymentTarget): Promise<ChainBasketsResult | null> {
  const client = getSubgraphClientForTarget(target);
  if (!client) return null;
  const result = await client.request<{ baskets: Array<Record<string, string>> }>(
    GET_BASKETS_OVERVIEW,
    { first: 500, skip: 0 }
  );
  const baskets = toBasketOverviewRows(result.baskets) as BasketOverview[];
  return { baskets, target };
}

async function fetchChainHolders(target: DeploymentTarget): Promise<Set<string>> {
  const client = getSubgraphClientForTarget(target);
  if (!client) return new Set();
  const holderIds = new Set<string>();
  let skip = 0;
  while (true) {
    const result = await client.request<{ userBasketPositions: RawTokenHolderPosition[] }>(
      GET_TOKEN_HOLDER_ADDRESSES,
      { first: DEFAULT_PAGE_SIZE, skip }
    );
    const rows = result.userBasketPositions ?? [];
    rows.forEach((row) => {
      if (row.user?.id) holderIds.add(row.user.id.toLowerCase());
    });
    if (rows.length < DEFAULT_PAGE_SIZE) break;
    skip += DEFAULT_PAGE_SIZE;
  }
  return holderIds;
}

function useAllChainsHeroStats() {
  const { configuredTargets } = useDeploymentTarget();

  const allBaskets = useQuery({
    queryKey: ["multichain", "heroBaskets", ...configuredTargets],
    queryFn: async () => {
      const results = await Promise.all(configuredTargets.map(fetchChainBaskets));
      return results.filter(Boolean) as ChainBasketsResult[];
    },
    staleTime: 15_000,
    retry: 1,
  });

  const allHolders = useQuery({
    queryKey: ["multichain", "heroHolders", ...configuredTargets],
    queryFn: async () => {
      const sets = await Promise.all(configuredTargets.map(fetchChainHolders));
      const union = new Set<string>();
      sets.forEach((s) => s.forEach((id) => union.add(id)));
      return union.size;
    },
    staleTime: 15_000,
    retry: 1,
  });

  const totalTvl = useMemo(() => {
    if (!allBaskets.data) return null;
    return allBaskets.data.reduce((sum, chain) => {
      return chain.baskets.reduce(
        (s, b) => s + (b.usdcBalance ?? 0n) + (b.perpAllocated ?? 0n),
        sum
      );
    }, 0n);
  }, [allBaskets.data]);

  const basketCount = useMemo(() => {
    if (!allBaskets.data) return null;
    return allBaskets.data.reduce((sum, chain) => sum + chain.baskets.length, 0);
  }, [allBaskets.data]);

  return {
    basketCount,
    tokenHolderCount: allHolders.data ?? null,
    totalTvl,
    totalPnL: null as bigint | null,
    totalApy: null as number | null,
    isLoading: allBaskets.isLoading || allHolders.isLoading,
    isError: allBaskets.isError || allHolders.isError,
  };
}

export function useHeroProtocolStats() {
  const { viewMode } = useDeploymentTarget();
  const single = useSingleChainHeroStats();
  const multi = useAllChainsHeroStats();

  if (viewMode === "all") return multi;
  return single;
}
