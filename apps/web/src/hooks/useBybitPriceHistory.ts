"use client";

import { useQuery } from "@tanstack/react-query";
import type { PriceHistoryWindow } from "@/lib/oracle-price-history";

export type BybitPriceChartPoint = {
  timestamp: number;
  priceUsd: number;
};

export interface UseBybitPriceHistoryResult {
  data: BybitPriceChartPoint[];
  source: "bybit" | "empty";
  isLoading: boolean;
  error: Error | null;
}

interface KlineResponse {
  symbol: string;
  bybitSymbol: string;
  window: PriceHistoryWindow;
  source: "bybit";
  points: BybitPriceChartPoint[];
}

const STALE_TIME_MS: Record<PriceHistoryWindow, number> = {
  "24H": 60_000,
  "7D": 5 * 60_000,
  "30D": 15 * 60_000,
};

/**
 * Fetch Bybit linear-perp kline history for a crypto oracle symbol (BASE-USD).
 * Disabled when `agentSymbol` is empty or `enabled` is false.
 */
export function useBybitPriceHistory(
  agentSymbol: string | undefined,
  window: PriceHistoryWindow,
  enabled = true,
): UseBybitPriceHistoryResult {
  const trimmed = agentSymbol?.trim().toUpperCase() ?? "";
  const queryEnabled = enabled && trimmed.length > 0;

  const query = useQuery<KlineResponse, Error>({
    queryKey: ["bybit", "kline", trimmed, window],
    queryFn: async () => {
      const params = new URLSearchParams({ symbol: trimmed, window });
      const res = await fetch(`/api/bybit/kline?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      return (await res.json()) as KlineResponse;
    },
    enabled: queryEnabled,
    staleTime: STALE_TIME_MS[window],
    retry: 1,
  });

  const points = query.data?.points ?? [];

  return {
    data: points,
    source: queryEnabled && points.length > 0 ? "bybit" : "empty",
    isLoading: query.isLoading && queryEnabled,
    error: query.error ?? null,
  };
}
