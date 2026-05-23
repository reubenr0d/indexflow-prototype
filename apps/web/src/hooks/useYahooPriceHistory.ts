"use client";

import { useQuery } from "@tanstack/react-query";
import type { PriceHistoryWindow } from "@/lib/oracle-price-history";

export type YahooPriceChartPoint = {
  timestamp: number;
  priceUsd: number;
};

export interface UseYahooPriceHistoryResult {
  data: YahooPriceChartPoint[];
  source: "yahoo" | "empty";
  isLoading: boolean;
  error: Error | null;
  resolvedSymbol: string | null;
  currency: string | null;
  fxRate: number | null;
}

interface HistoryResponse {
  symbol: string;
  resolvedSymbol: string | null;
  window: PriceHistoryWindow;
  interval: string;
  currency: string;
  fxRate: number;
  points: YahooPriceChartPoint[];
}

const STALE_TIME_MS: Record<PriceHistoryWindow, number> = {
  "24H": 60_000,
  "7D": 5 * 60_000,
  "30D": 15 * 60_000,
};

/**
 * Fetch Yahoo Finance price history (USD) for a Yahoo ticker.
 *
 * The hook is disabled (returns empty data without firing a request) when no
 * `yahooSymbol` is provided. This makes it safe to wire into UI that may not
 * have a usable symbol for every asset (e.g. address-style placeholders).
 */
export function useYahooPriceHistory(
  yahooSymbol: string | undefined,
  window: PriceHistoryWindow,
): UseYahooPriceHistoryResult {
  const trimmed = yahooSymbol?.trim() ?? "";
  const enabled = trimmed.length > 0;

  const query = useQuery<HistoryResponse, Error>({
    queryKey: ["yahoo-finance", "history", trimmed, window],
    queryFn: async () => {
      const params = new URLSearchParams({ symbol: trimmed, window });
      const res = await fetch(`/api/yahoo-finance/history?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      return (await res.json()) as HistoryResponse;
    },
    enabled,
    staleTime: STALE_TIME_MS[window],
    retry: 1,
  });

  const points = query.data?.points ?? [];

  return {
    data: points,
    source: enabled && points.length > 0 ? "yahoo" : "empty",
    isLoading: query.isLoading && enabled,
    error: query.error ?? null,
    resolvedSymbol: query.data?.resolvedSymbol ?? null,
    currency: query.data?.currency ?? null,
    fxRate: query.data?.fxRate ?? null,
  };
}
