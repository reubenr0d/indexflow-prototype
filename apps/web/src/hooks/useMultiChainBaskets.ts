"use client";

import { useQuery } from "@tanstack/react-query";
import { chainIdForDeploymentTarget, type DeploymentTarget } from "@/lib/deployment";
import { getSubgraphClientForTarget } from "@/lib/subgraph/client";
import { GET_BASKETS_OVERVIEW } from "@/lib/subgraph/queries";
import { toBasketOverviewRows } from "@/lib/subgraph/transform";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { type BasketOverview } from "@/hooks/subgraph/useBasketOverview";

export type MultiChainBasket = BasketOverview & {
  chainId: number;
  deploymentTarget: DeploymentTarget;
};

async function fetchBasketsForTarget(target: DeploymentTarget): Promise<MultiChainBasket[]> {
  const client = getSubgraphClientForTarget(target);
  if (!client) return [];
  const cid = chainIdForDeploymentTarget(target);
  const result = await client.request<{ baskets: Array<Record<string, string>> }>(
    GET_BASKETS_OVERVIEW,
    { first: 500, skip: 0, chainId: cid }
  );
  const baskets = toBasketOverviewRows(result.baskets) as BasketOverview[];
  return baskets.map((b) => ({ ...b, chainId: cid, deploymentTarget: target }));
}

/**
 * Fetches baskets from all configured chains and merges them into a single list.
 * Only active when viewMode === "all".
 */
export function useMultiChainBaskets() {
  const { viewMode, configuredTargets } = useDeploymentTarget();
  const isAll = viewMode === "all";

  return useQuery({
    queryKey: ["multichain", "baskets", ...configuredTargets],
    queryFn: async () => {
      const results = await Promise.all(configuredTargets.map(fetchBasketsForTarget));
      return results.flat();
    },
    enabled: isAll,
    staleTime: 15_000,
    retry: 1,
  });
}
