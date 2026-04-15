"use client";

import { useQuery } from "@tanstack/react-query";
import { type Address } from "viem";
import { toUserPortfolioRows } from "@/lib/subgraph/transform";
import { GET_USER_PORTFOLIO } from "@/lib/subgraph/queries";
import { useAvailableSubgraph, DEFAULT_PAGE_SIZE, type RawUserBasketPosition } from "./useSubgraphShared";

export type UserPortfolioHolding = {
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
};

export function useUserPortfolioQuery(userAddress: Address | undefined, first = DEFAULT_PAGE_SIZE) {
  const { client, isAvailable } = useAvailableSubgraph();

  return useQuery({
    queryKey: ["subgraph", "userPortfolio", userAddress, first],
    queryFn: async () => {
      if (!client || !userAddress) return null;

      const result = await client.request<{ userBasketPositions: RawUserBasketPosition[] }>(GET_USER_PORTFOLIO, {
        userId: userAddress.toLowerCase(),
        first,
      });

      return toUserPortfolioRows(result.userBasketPositions as unknown as Array<Record<string, unknown>>) as {
        holdings: UserPortfolioHolding[];
        totalValueUsdc: bigint;
      };
    },
    enabled: isAvailable && Boolean(userAddress),
    staleTime: 15_000,
    retry: 1,
  });
}
