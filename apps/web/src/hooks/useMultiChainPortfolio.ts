"use client";

import { useQuery } from "@tanstack/react-query";
import { type Address } from "viem";
import { chainIdForDeploymentTarget, type DeploymentTarget } from "@/lib/deployment";
import { getSubgraphClientForTarget } from "@/lib/subgraph/client";
import { GET_USER_PORTFOLIO } from "@/lib/subgraph/queries";
import { toUserPortfolioRows } from "@/lib/subgraph/transform";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { type RawUserBasketPosition } from "@/hooks/subgraph/useSubgraphShared";

export type MultiChainHolding = {
  id: string;
  vault: Address;
  name: string;
  shareToken: Address;
  sharePrice: bigint;
  basketPrice: bigint;
  shareBalance: bigint;
  valueUsdc: bigint;
  netDepositedUsdc: bigint;
  netRedeemedUsdc: bigint;
  chainId: number;
  deploymentTarget: DeploymentTarget;
};

async function fetchPortfolioForTarget(
  target: DeploymentTarget,
  userAddress: string,
): Promise<MultiChainHolding[]> {
  const client = getSubgraphClientForTarget(target);
  if (!client) return [];
  const cid = chainIdForDeploymentTarget(target);
  const result = await client.request<{ userBasketPositions: RawUserBasketPosition[] }>(
    GET_USER_PORTFOLIO,
    { userAddress: userAddress.toLowerCase(), chainId: cid, first: 100 }
  );
  const { holdings } = toUserPortfolioRows(
    result.userBasketPositions as unknown as Array<Record<string, unknown>>
  ) as { holdings: Array<Record<string, unknown>>; totalValueUsdc: bigint };
  return holdings.map((h: Record<string, unknown>) => ({
    id: h.id as string,
    vault: h.vault as Address,
    name: h.name as string,
    shareToken: h.shareToken as Address,
    sharePrice: h.sharePrice as bigint,
    basketPrice: h.basketPrice as bigint,
    shareBalance: h.shareBalance as bigint,
    valueUsdc: h.valueUsdc as bigint,
    netDepositedUsdc: h.netDepositedUsdc as bigint,
    netRedeemedUsdc: h.netRedeemedUsdc as bigint,
    chainId: cid,
    deploymentTarget: target,
  }));
}

/**
 * Fetches user portfolio from all configured chain subgraphs and merges
 * into a single holdings list with per-holding chain attribution.
 * Only active when viewMode === "all".
 */
export function useMultiChainPortfolio(userAddress: Address | undefined) {
  const { viewMode, configuredTargets } = useDeploymentTarget();
  const isAll = viewMode === "all";

  return useQuery({
    queryKey: ["multichain", "portfolio", userAddress, ...configuredTargets],
    queryFn: async () => {
      if (!userAddress) return { holdings: [] as MultiChainHolding[], totalValueUsdc: 0n };
      const results = await Promise.all(
        configuredTargets.map((t) => fetchPortfolioForTarget(t, userAddress))
      );
      const holdings = results.flat();
      const totalValueUsdc = holdings.reduce((sum, h) => sum + h.valueUsdc, 0n);
      return { holdings, totalValueUsdc };
    },
    enabled: isAll && Boolean(userAddress),
    staleTime: 15_000,
    retry: 1,
  });
}
