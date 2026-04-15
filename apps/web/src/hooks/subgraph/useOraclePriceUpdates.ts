"use client";

import { useQuery } from "@tanstack/react-query";
import { parseBigInt } from "@/lib/subgraph/transform";
import { GET_ORACLE_PRICE_UPDATES } from "@/lib/subgraph/queries";
import { useAvailableSubgraph, type RawOraclePriceUpdate } from "./useSubgraphShared";

export type OraclePriceUpdateRow = {
  id: string;
  assetId: `0x${string}`;
  price: bigint;
  priceTimestamp: bigint;
  blockNumber: bigint;
  txHash: `0x${string}`;
  logIndex: bigint;
  createdAt: bigint;
};

export function useOraclePriceUpdatesQuery(assetId: `0x${string}` | undefined, minTimestamp: bigint, first = 500) {
  const { client, isAvailable } = useAvailableSubgraph();

  return useQuery({
    queryKey: ["subgraph", "oraclePriceUpdates", assetId, minTimestamp.toString(), first],
    queryFn: async (): Promise<OraclePriceUpdateRow[] | null> => {
      if (!client || !assetId) return null;
      const result = await client.request<{ oraclePriceUpdates: RawOraclePriceUpdate[] }>(
        GET_ORACLE_PRICE_UPDATES,
        {
          assetId: assetId.toLowerCase(),
          minTimestamp: minTimestamp.toString(),
          first,
        }
      );

      return result.oraclePriceUpdates.map((row): OraclePriceUpdateRow => ({
        id: row.id,
        assetId: row.assetId as `0x${string}`,
        price: parseBigInt(row.price),
        priceTimestamp: parseBigInt(row.priceTimestamp),
        blockNumber: parseBigInt(row.blockNumber),
        txHash: row.txHash as `0x${string}`,
        logIndex: parseBigInt(row.logIndex),
        createdAt: parseBigInt(row.createdAt),
      }));
    },
    enabled: isAvailable && Boolean(assetId),
    staleTime: 15_000,
    retry: 1,
  });
}
