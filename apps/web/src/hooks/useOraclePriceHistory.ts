"use client";

import { useMemo } from "react";
import {
  type PriceHistoryWindow,
  PRICE_HISTORY_WINDOW_SECONDS,
  filterHistoryWindow,
  sortAndDedupeHistory,
} from "@/lib/oracle-price-history";
import { useOraclePriceUpdatesQuery } from "@/hooks/subgraph/useOraclePriceUpdates";

const MAX_HISTORY_ROWS = 500;

export function useOraclePriceHistory(assetId: `0x${string}` | undefined, window: PriceHistoryWindow) {
  const minTimestamp = useMemo(
    () => BigInt(Math.floor(Date.now() / 1000)) - PRICE_HISTORY_WINDOW_SECONDS[window],
    [window]
  );

  const subgraphQuery = useOraclePriceUpdatesQuery(assetId, minTimestamp, MAX_HISTORY_ROWS);

  const history = useMemo(() => {
    const rows = subgraphQuery.data ?? [];
    return sortAndDedupeHistory(filterHistoryWindow(rows, minTimestamp)).slice(0, MAX_HISTORY_ROWS);
  }, [subgraphQuery.data, minTimestamp]);

  const source: "subgraph" | "empty" =
    history.length > 0 ? "subgraph" : "empty";

  return {
    data: history,
    source,
    isLoading: subgraphQuery.isLoading,
    error: subgraphQuery.error ?? null,
  };
}
