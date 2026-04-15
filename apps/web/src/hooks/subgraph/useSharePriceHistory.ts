"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { type Address } from "viem";
import { usePublicClient } from "wagmi";
import { BasketVaultABI } from "@/abi/BasketVault";
import { getSubgraphClient } from "@/lib/subgraph/client";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { parseBigInt } from "@/lib/subgraph/transform";
import { GET_SHARE_PRICE_HISTORY } from "@/lib/subgraph/queries";
import { findBlockAtOrBeforeTimestamp } from "./useBasketTrends";

export type SharePricePoint = {
  timestamp: number;
  sharePrice: bigint;
  tvl: bigint;
};

export type SharePriceHistoryResult = {
  points: SharePricePoint[];
  source: "subgraph" | "rpc" | "empty";
};

const HISTORY_SAMPLE_COUNT = 20;

export function useSharePriceHistory(vault: Address | undefined) {
  const { chainId, isSubgraphEnabled, subgraphUrl } = useDeploymentTarget();
  const client = useMemo(
    () => (isSubgraphEnabled ? getSubgraphClient(subgraphUrl) : null),
    [isSubgraphEnabled, subgraphUrl]
  );
  const publicClient = usePublicClient({ chainId });

  return useQuery({
    queryKey: ["subgraph", "sharePriceHistory", chainId, vault],
    queryFn: async (): Promise<SharePriceHistoryResult> => {
      if (!vault) return { points: [], source: "empty" };

      if (client) {
        try {
          const result = await client.request<{
            basketSnapshots: Array<{
              bucketStart: string;
              updatedAt: string;
              sharePrice: string;
              tvlBookUsdc: string;
            }>;
          }>(GET_SHARE_PRICE_HISTORY, { id: vault.toLowerCase(), first: 90 });

          if (result.basketSnapshots && result.basketSnapshots.length > 0) {
            const points: SharePricePoint[] = result.basketSnapshots.map((s) => ({
              timestamp: Number(parseBigInt(s.updatedAt)),
              sharePrice: parseBigInt(s.sharePrice),
              tvl: parseBigInt(s.tvlBookUsdc),
            }));
            return { points, source: "subgraph" };
          }
        } catch {
          // Fall through to RPC
        }
      }

      if (!publicClient) {
        return { points: [], source: "empty" };
      }

      return loadSharePriceHistoryFromRpc(publicClient, vault);
    },
    enabled: Boolean(vault),
    staleTime: 60_000,
    retry: 1,
  });
}

async function loadSharePriceHistoryFromRpc(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
  vault: Address
): Promise<SharePriceHistoryResult> {
  try {
    const currentBlockNumber = await publicClient.getBlockNumber();
    const currentBlock = await publicClient.getBlock({ blockNumber: currentBlockNumber });

    const lookback30d = currentBlock.timestamp - BigInt(30 * 24 * 60 * 60);
    const startBlock = await findBlockAtOrBeforeTimestamp(publicClient, lookback30d);
    if (startBlock == null) {
      return { points: [], source: "rpc" };
    }

    const blockRange = currentBlockNumber - startBlock;
    const step = blockRange / BigInt(HISTORY_SAMPLE_COUNT);
    if (step === 0n) {
      return { points: [], source: "rpc" };
    }

    const sampleBlocks: bigint[] = [];
    for (let i = 0n; i <= BigInt(HISTORY_SAMPLE_COUNT); i++) {
      const bn = startBlock + i * step;
      if (bn <= currentBlockNumber) sampleBlocks.push(bn);
    }
    if (sampleBlocks[sampleBlocks.length - 1] !== currentBlockNumber) {
      sampleBlocks.push(currentBlockNumber);
    }

    const results = await Promise.all(
      sampleBlocks.map(async (blockNumber) => {
        try {
          const [block, sharePrice] = await Promise.all([
            publicClient.getBlock({ blockNumber }),
            publicClient.readContract({
              address: vault,
              abi: BasketVaultABI,
              functionName: "getSharePrice",
              blockNumber,
            }) as Promise<bigint>,
          ]);
          return {
            timestamp: Number(block.timestamp),
            sharePrice,
            tvl: 0n,
          };
        } catch {
          return null;
        }
      })
    );

    const points = results.filter((r): r is SharePricePoint => r !== null);
    return { points, source: "rpc" };
  } catch {
    return { points: [], source: "rpc" };
  }
}
