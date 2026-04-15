"use client";

import { useQuery } from "@tanstack/react-query";
import { type Address } from "viem";
import { toBasketOverviewRows } from "@/lib/subgraph/transform";
import { GET_BASKETS_OVERVIEW } from "@/lib/subgraph/queries";
import { useAvailableSubgraph, DEFAULT_PAGE_SIZE } from "./useSubgraphShared";

export type BasketOverview = {
  vault: Address;
  name: string;
  shareToken: Address;
  assetCount: bigint;
  basketPrice: bigint;
  sharePrice: bigint;
  usdcBalance: bigint;
  perpAllocated: bigint;
  tvlBookUsdc: bigint;
  totalSupply: bigint;
  createdAt: bigint;
  updatedAt: bigint;
};

export function useBasketsOverviewQuery(params?: { first?: number; skip?: number }) {
  const { client, isAvailable } = useAvailableSubgraph();
  const first = params?.first ?? DEFAULT_PAGE_SIZE;
  const skip = params?.skip ?? 0;

  return useQuery({
    queryKey: ["subgraph", "basketsOverview", first, skip],
    queryFn: async () => {
      if (!client) return null;
      const result = await client.request<{ baskets: Array<Record<string, string>> }>(
        GET_BASKETS_OVERVIEW,
        { first, skip }
      );

      return toBasketOverviewRows(result.baskets) as BasketOverview[];
    },
    enabled: isAvailable,
    staleTime: 15_000,
    retry: 1,
  });
}
