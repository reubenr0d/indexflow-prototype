"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { type Address } from "viem";
import { getSubgraphClient } from "@/lib/subgraph/client";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { parseBigInt } from "@/lib/subgraph/transform";
import { GET_SHARE_PRICE_HISTORY } from "@/lib/subgraph/queries";

export type SharePricePoint = {
  timestamp: number;
  sharePrice: bigint;
  tvl: bigint;
};

export type SharePriceHistoryResult = {
  points: SharePricePoint[];
  source: "subgraph" | "empty";
};

export function useSharePriceHistory(vault: Address | undefined) {
  const { chainId, isSubgraphEnabled, subgraphUrl } = useDeploymentTarget();
  const client = useMemo(
    () => (isSubgraphEnabled ? getSubgraphClient(subgraphUrl) : null),
    [isSubgraphEnabled, subgraphUrl]
  );
  const isAvailable = Boolean(vault) && Boolean(client);

  return useQuery({
    queryKey: ["subgraph", "sharePriceHistory", chainId, vault],
    queryFn: async (): Promise<SharePriceHistoryResult> => {
      if (!vault || !client) return { points: [], source: "empty" };

      try {
        const result = await client.request<{
          basketSnapshots: Array<{
            bucketStart: string;
            updatedAt: string;
            sharePrice: string;
            tvlBookUsdc: string;
          }>;
        }>(GET_SHARE_PRICE_HISTORY, { id: `${chainId}-${vault.toLowerCase()}`, first: 90 });
        if (result.basketSnapshots && result.basketSnapshots.length > 0) {
          const points: SharePricePoint[] = result.basketSnapshots.map((s) => ({
            timestamp: Number(parseBigInt(s.updatedAt)),
            sharePrice: parseBigInt(s.sharePrice),
            tvl: parseBigInt(s.tvlBookUsdc),
          }));
          return { points, source: "subgraph" };
        }
        return { points: [], source: "empty" };
      } catch {
        return { points: [], source: "empty" };
      }
    },
    enabled: isAvailable,
    staleTime: 60_000,
    retry: 1,
  });
}
