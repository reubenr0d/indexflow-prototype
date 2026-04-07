"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { parseAbiItem, type Address } from "viem";
import { useChainId, usePublicClient } from "wagmi";
import { getContracts } from "@/config/contracts";
import {
  PRICE_HISTORY_WINDOW_SECONDS,
  type PriceHistoryWindow,
  type OraclePriceHistoryRow,
  filterHistoryWindow,
  sortAndDedupeHistory,
} from "@/lib/oracle-price-history";
import { useOraclePriceUpdatesQuery } from "@/hooks/subgraph/useSubgraphQueries";

const MAX_HISTORY_ROWS = 500;

export function useOraclePriceHistory(assetId: `0x${string}` | undefined, window: PriceHistoryWindow) {
  const chainId = useChainId();
  const { oracleAdapter } = getContracts(chainId);
  const publicClient = usePublicClient();
  const minTimestamp = useMemo(
    () => BigInt(Math.floor(Date.now() / 1000)) - PRICE_HISTORY_WINDOW_SECONDS[window],
    [window]
  );

  const subgraphQuery = useOraclePriceUpdatesQuery(assetId, minTimestamp, MAX_HISTORY_ROWS);
  const subgraphRows = useMemo(() => subgraphQuery.data ?? [], [subgraphQuery.data]);
  const shouldUseRpcFallback =
    Boolean(assetId) && (subgraphQuery.isError || (subgraphQuery.isSuccess && subgraphRows.length === 0));

  const rpcQuery = useQuery({
    queryKey: ["oraclePriceHistoryRpc", chainId, oracleAdapter, assetId, minTimestamp.toString()],
    enabled: Boolean(publicClient) && shouldUseRpcFallback,
    queryFn: async (): Promise<OraclePriceHistoryRow[]> => {
      if (!publicClient || !assetId) return [];

      const logs = await publicClient.getLogs({
        address: oracleAdapter as Address,
        event: parseAbiItem("event PriceUpdated(bytes32 indexed assetId, uint256 price, uint256 timestamp)"),
        args: { assetId },
        fromBlock: 0n,
        toBlock: "latest",
      });

      const rows = logs
        .map((log): OraclePriceHistoryRow | null => {
          const eventAssetId = log.args.assetId;
          const price = log.args.price;
          const timestamp = log.args.timestamp;
          if (!eventAssetId || price === undefined || timestamp === undefined) return null;
          return {
            id: `${log.transactionHash}-${log.logIndex}`,
            assetId: eventAssetId,
            price,
            priceTimestamp: timestamp,
            blockNumber: log.blockNumber,
            txHash: log.transactionHash,
            logIndex: BigInt(log.logIndex),
            createdAt: timestamp,
          };
        })
        .filter((row): row is OraclePriceHistoryRow => row !== null);

      return filterHistoryWindow(sortAndDedupeHistory(rows), minTimestamp).slice(0, MAX_HISTORY_ROWS);
    },
    staleTime: 15_000,
    retry: 1,
  });

  const history = useMemo(() => {
    const rows = subgraphRows.length > 0 ? subgraphRows : rpcQuery.data ?? [];
    return sortAndDedupeHistory(filterHistoryWindow(rows, minTimestamp)).slice(0, MAX_HISTORY_ROWS);
  }, [subgraphRows, rpcQuery.data, minTimestamp]);

  const source: "subgraph" | "rpc" | "empty" =
    subgraphRows.length > 0 ? "subgraph" : history.length > 0 ? "rpc" : "empty";

  return {
    data: history,
    source,
    isLoading: subgraphQuery.isLoading || rpcQuery.isLoading,
    error: subgraphRows.length > 0 ? null : rpcQuery.error ?? subgraphQuery.error ?? null,
  };
}
