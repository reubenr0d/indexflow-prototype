"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { type Address } from "viem";
import { getSubgraphClient } from "@/lib/subgraph/client";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { parseBigInt } from "@/lib/subgraph/transform";
import { GET_BASKET_TREND_SNAPSHOTS, GET_BASKETS_WEEK_SNAPSHOTS } from "@/lib/subgraph/queries";
import { type RawBasketSnapshot } from "./useSubgraphShared";

type BasketSnapshotPeriod = "1d" | "7d";

type BasketTrendState = {
  timestamp: bigint;
  sharePrice: bigint;
  basketPrice: bigint;
  usdcBalanceUsdc: bigint;
  perpAllocatedUsdc: bigint;
  tvlBookUsdc: bigint;
  totalSupplyShares: bigint;
  assetCount: bigint;
  depositFeeBps: bigint;
  redeemFeeBps: bigint;
  minReserveBps: bigint;
  requiredReserveUsdc: bigint;
  availableForPerpUsdc: bigint;
  collectedFeesUsdc: bigint;
  cumulativeFeesCollectedUsdc: bigint;
  openInterest: bigint;
  collateralLocked: bigint;
  positionCount: bigint;
};

export type BasketTrendSnapshot = BasketTrendState & {
  period: BasketSnapshotPeriod;
  bucketStart: bigint;
  bucketEnd: bigint;
};

export type BasketTrendSeries = {
  current: BasketTrendSnapshot | null;
  previous: BasketTrendSnapshot | null;
  delta: BasketTrendState | null;
};

export type BasketTrendSnapshotsResult = {
  day: BasketTrendSeries;
  week: BasketTrendSeries;
  source: "subgraph" | "empty";
};

type RawBasketWeekSnapshotGroup = {
  id: string;
  vault?: string | null;
  snapshots: RawBasketSnapshot[];
};

export function useBasketTrendSnapshots(vault: Address | undefined) {
  const { chainId, isSubgraphEnabled, subgraphUrl } = useDeploymentTarget();
  const client = useMemo(
    () => (isSubgraphEnabled ? getSubgraphClient(subgraphUrl) : null),
    [isSubgraphEnabled, subgraphUrl]
  );
  const isAvailable = Boolean(vault) && Boolean(client);

  return useQuery({
    queryKey: ["subgraph", "basketTrendSnapshots", chainId, vault],
    queryFn: async (): Promise<BasketTrendSnapshotsResult | null> => {
      if (!vault || !client) return null;

      try {
        const result = await client.request<{
          daySnapshots: RawBasketSnapshot[];
          weekSnapshots: RawBasketSnapshot[];
        }>(GET_BASKET_TREND_SNAPSHOTS, { id: `${chainId}-${vault.toLowerCase()}` });

        return toBasketTrendSnapshotsResult(
          result.daySnapshots ?? [],
          result.weekSnapshots ?? [],
          "subgraph"
        );
      } catch {
        return emptyBasketTrendSnapshots();
      }
    },
    enabled: isAvailable,
    staleTime: 15_000,
    retry: 1,
  });
}

export function useBasketsWeekSnapshots(vaults: Address[]) {
  const { chainId, isSubgraphEnabled, subgraphUrl } = useDeploymentTarget();
  const client = useMemo(
    () => (isSubgraphEnabled ? getSubgraphClient(subgraphUrl) : null),
    [isSubgraphEnabled, subgraphUrl]
  );
  const normalizedVaults = useMemo(
    () => vaults.map((vault) => vault.toLowerCase() as Address),
    [vaults]
  );
  const normalizedIds = useMemo(
    () => normalizedVaults.map((vault) => `${chainId}-${vault}`),
    [chainId, normalizedVaults]
  );

  return useQuery({
    queryKey: ["subgraph", "basketsWeekSnapshots", chainId, normalizedIds.join(",")],
    queryFn: async (): Promise<Map<Address, BasketTrendSeries>> => {
      if (normalizedVaults.length === 0 || !client) return new Map();

      try {
        const result = await client.request<{ baskets: RawBasketWeekSnapshotGroup[] }>(
          GET_BASKETS_WEEK_SNAPSHOTS,
          { ids: normalizedIds }
        );

        return new Map(
          (result.baskets ?? []).map((row) => [
            ((row.vault ?? row.id).split("-").pop() ?? row.id).toLowerCase() as Address,
            toBasketTrendSeries(row.snapshots ?? [], "7d"),
          ])
        );
      } catch {
        return new Map();
      }
    },
    enabled: normalizedVaults.length > 0 && Boolean(client),
    staleTime: 15_000,
    retry: 1,
  });
}

function toBasketTrendSnapshotsResult(
  daySnapshots: RawBasketSnapshot[],
  weekSnapshots: RawBasketSnapshot[],
  source: BasketTrendSnapshotsResult["source"]
): BasketTrendSnapshotsResult {
  return {
    day: toBasketTrendSeries(daySnapshots, "1d"),
    week: toBasketTrendSeries(weekSnapshots, "7d"),
    source,
  };
}

function toBasketTrendSeries(rows: RawBasketSnapshot[], period: BasketSnapshotPeriod): BasketTrendSeries {
  const snapshots = rows.map((row) => toBasketTrendSnapshot(row, period));
  const current = snapshots[0] ?? null;
  const previous = snapshots[1] ?? null;
  return {
    current,
    previous,
    delta: current && previous ? diffBasketTrendState(current, previous) : null,
  };
}

function toBasketTrendSnapshot(row: RawBasketSnapshot, period: BasketSnapshotPeriod): BasketTrendSnapshot {
  return {
    period,
    bucketStart: parseBigInt(row.bucketStart),
    bucketEnd: parseBigInt(row.bucketEnd),
    timestamp: parseBigInt(row.updatedAt),
    sharePrice: parseBigInt(row.sharePrice),
    basketPrice: parseBigInt(row.basketPrice),
    usdcBalanceUsdc: parseBigInt(row.usdcBalanceUsdc),
    perpAllocatedUsdc: parseBigInt(row.perpAllocatedUsdc),
    tvlBookUsdc: parseBigInt(row.tvlBookUsdc),
    totalSupplyShares: parseBigInt(row.totalSupplyShares),
    assetCount: parseBigInt(row.assetCount),
    depositFeeBps: parseBigInt(row.depositFeeBps),
    redeemFeeBps: parseBigInt(row.redeemFeeBps),
    minReserveBps: parseBigInt(row.minReserveBps),
    requiredReserveUsdc: parseBigInt(row.requiredReserveUsdc),
    availableForPerpUsdc: parseBigInt(row.availableForPerpUsdc),
    collectedFeesUsdc: parseBigInt(row.collectedFeesUsdc),
    cumulativeFeesCollectedUsdc: parseBigInt(row.cumulativeFeesCollectedUsdc),
    openInterest: parseBigInt(row.openInterest),
    collateralLocked: parseBigInt(row.collateralLocked),
    positionCount: parseBigInt(row.positionCount),
  };
}

function diffBasketTrendState(current: BasketTrendState, previous: BasketTrendState): BasketTrendState {
  return {
    timestamp: current.timestamp,
    sharePrice: current.sharePrice - previous.sharePrice,
    basketPrice: current.basketPrice - previous.basketPrice,
    usdcBalanceUsdc: current.usdcBalanceUsdc - previous.usdcBalanceUsdc,
    perpAllocatedUsdc: current.perpAllocatedUsdc - previous.perpAllocatedUsdc,
    tvlBookUsdc: current.tvlBookUsdc - previous.tvlBookUsdc,
    totalSupplyShares: current.totalSupplyShares - previous.totalSupplyShares,
    assetCount: current.assetCount - previous.assetCount,
    depositFeeBps: current.depositFeeBps - previous.depositFeeBps,
    redeemFeeBps: current.redeemFeeBps - previous.redeemFeeBps,
    minReserveBps: current.minReserveBps - previous.minReserveBps,
    requiredReserveUsdc: current.requiredReserveUsdc - previous.requiredReserveUsdc,
    availableForPerpUsdc: current.availableForPerpUsdc - previous.availableForPerpUsdc,
    collectedFeesUsdc: current.collectedFeesUsdc - previous.collectedFeesUsdc,
    cumulativeFeesCollectedUsdc: current.cumulativeFeesCollectedUsdc - previous.cumulativeFeesCollectedUsdc,
    openInterest: current.openInterest - previous.openInterest,
    collateralLocked: current.collateralLocked - previous.collateralLocked,
    positionCount: current.positionCount - previous.positionCount,
  };
}

function emptyBasketTrendSnapshots(): BasketTrendSnapshotsResult {
  return {
    day: { current: null, previous: null, delta: null },
    week: { current: null, previous: null, delta: null },
    source: "empty",
  };
}
