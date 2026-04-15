"use client";

import { useQuery } from "@tanstack/react-query";
import { useAvailableSubgraph } from "@/hooks/subgraph/useSubgraphShared";
import { GET_RECENT_INTENTS } from "@/lib/subgraph/queries";

export type IntentLifecycleStatus = "pending" | "in_flight" | "executed" | "refunded";

export type RecentIntent = {
  id: string;
  intentId: string;
  user: string;
  intentType: string;
  status: IntentLifecycleStatus;
  amount: bigint;
  basketVault: string | null;
  sharesOrUsdc: bigint | null;
  createdAt: number;
  txHash: string;
};

export type IntentStatsView = {
  totalSubmitted: number;
  totalExecuted: number;
  totalRefunded: number;
  cumulativeVolumeUsdc: bigint;
};

export type RecentIntentsView = {
  intents: RecentIntent[];
  stats: IntentStatsView | null;
  isLoading: boolean;
  isPlaceholder: boolean;
};

type RawIntentAction = {
  id: string;
  intentId: string;
  user: string;
  intentType: string;
  status: string;
  amount: string;
  basketVault: string | null;
  sharesOrUsdc: string | null;
  timestamp: string;
  txHash: string;
};

type RawIntentStats = {
  totalSubmitted: string;
  totalExecuted: string;
  totalRefunded: string;
  cumulativeVolumeUsdc: string;
} | null;

function mapStatus(raw: string): IntentLifecycleStatus {
  switch (raw) {
    case "SUBMITTED":
      return "pending";
    case "EXECUTED":
      return "executed";
    case "REFUNDED":
      return "refunded";
    default:
      return "pending";
  }
}

function transformIntent(raw: RawIntentAction): RecentIntent {
  return {
    id: raw.id,
    intentId: raw.intentId,
    user: raw.user,
    intentType: raw.intentType,
    status: mapStatus(raw.status),
    amount: BigInt(raw.amount),
    basketVault: raw.basketVault ?? null,
    sharesOrUsdc: raw.sharesOrUsdc ? BigInt(raw.sharesOrUsdc) : null,
    createdAt: Number(raw.timestamp),
    txHash: raw.txHash,
  };
}

export function useRecentIntents(first = 20): RecentIntentsView {
  const { client, isAvailable } = useAvailableSubgraph();

  const { data, isLoading } = useQuery({
    queryKey: ["subgraph", "recentIntents", first],
    queryFn: async () => {
      if (!client) return null;
      const result = await client.request<{
        intentActions: RawIntentAction[];
        intentStats: RawIntentStats;
      }>(GET_RECENT_INTENTS, { first, skip: 0 });
      return result;
    },
    enabled: isAvailable,
    staleTime: 15_000,
    retry: 1,
  });

  if (data) {
    const stats: IntentStatsView | null = data.intentStats
      ? {
          totalSubmitted: Number(data.intentStats.totalSubmitted),
          totalExecuted: Number(data.intentStats.totalExecuted),
          totalRefunded: Number(data.intentStats.totalRefunded),
          cumulativeVolumeUsdc: BigInt(data.intentStats.cumulativeVolumeUsdc),
        }
      : null;

    return {
      intents: data.intentActions.map(transformIntent),
      stats,
      isLoading: false,
      isPlaceholder: false,
    };
  }

  return {
    intents: [],
    stats: null,
    isLoading: isAvailable && isLoading,
    isPlaceholder: true,
  };
}
