"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { type Address } from "viem";
import { usePublicClient } from "wagmi";
import { BasketShareTokenABI } from "@/abi/BasketShareToken";
import { BasketVaultABI } from "@/abi/BasketVault";
import { getSubgraphClient } from "@/lib/subgraph/client";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { parseBigInt } from "@/lib/subgraph/transform";
import { GET_BASKET_TREND_SNAPSHOTS, GET_BASKETS_WEEK_SNAPSHOTS } from "@/lib/subgraph/queries";
import { ERC20_BALANCE_OF_ABI, type RawBasketSnapshot } from "./useSubgraphShared";

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
  source: "subgraph" | "rpc" | "empty";
};

type RawBasketWeekSnapshotGroup = {
  id: string;
  snapshots: RawBasketSnapshot[];
};

const TREND_PERIODS: Record<BasketSnapshotPeriod, bigint> = {
  "1d": BigInt(24 * 60 * 60),
  "7d": BigInt(7 * 24 * 60 * 60),
};

export function useBasketTrendSnapshots(vault: Address | undefined) {
  const { chainId, isSubgraphEnabled, subgraphUrl } = useDeploymentTarget();
  const client = useMemo(
    () => (isSubgraphEnabled ? getSubgraphClient(subgraphUrl) : null),
    [isSubgraphEnabled, subgraphUrl]
  );
  const publicClient = usePublicClient({ chainId });
  const isAvailable = Boolean(vault);

  return useQuery({
    queryKey: ["subgraph", "basketTrendSnapshots", chainId, vault],
    queryFn: async (): Promise<BasketTrendSnapshotsResult | null> => {
      if (!vault) return null;

      if (client) {
        try {
          const result = await client.request<{
            daySnapshots: RawBasketSnapshot[];
            weekSnapshots: RawBasketSnapshot[];
          }>(GET_BASKET_TREND_SNAPSHOTS, { id: vault.toLowerCase() });

          const parsed = toBasketTrendSnapshotsResult(
            result.daySnapshots ?? [],
            result.weekSnapshots ?? [],
            "subgraph"
          );
          if (hasBasketTrendData(parsed)) {
            return parsed;
          }
        } catch {
          // Best-effort fallback below.
        }
      }

      if (!publicClient) {
        return emptyBasketTrendSnapshots();
      }

      return loadBasketTrendSnapshotsFromRpc(publicClient, vault);
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
  const publicClient = usePublicClient({ chainId });
  const normalizedVaults = useMemo(
    () => vaults.map((vault) => vault.toLowerCase() as Address),
    [vaults]
  );

  return useQuery({
    queryKey: ["subgraph", "basketsWeekSnapshots", chainId, normalizedVaults.join(",")],
    queryFn: async (): Promise<Map<Address, BasketTrendSeries>> => {
      if (normalizedVaults.length === 0) return new Map();

      if (client) {
        try {
          const result = await client.request<{ baskets: RawBasketWeekSnapshotGroup[] }>(
            GET_BASKETS_WEEK_SNAPSHOTS,
            { ids: normalizedVaults }
          );

          return new Map(
            (result.baskets ?? []).map((row) => [
              row.id.toLowerCase() as Address,
              toBasketTrendSeries(row.snapshots ?? [], "7d"),
            ])
          );
        } catch {
          // Best-effort RPC fallback below.
        }
      }

      if (!publicClient) {
        return new Map();
      }

      const entries = await Promise.all(
        normalizedVaults.map(async (vault) => {
          const snapshots = await loadBasketTrendSnapshotsFromRpc(publicClient, vault);
          return [vault, snapshots.week] as const;
        })
      );
      return new Map(entries);
    },
    enabled: normalizedVaults.length > 0,
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

function hasBasketTrendData(result: BasketTrendSnapshotsResult): boolean {
  return Boolean(result.day.current || result.day.previous || result.week.current || result.week.previous);
}

function emptyBasketTrendSnapshots(): BasketTrendSnapshotsResult {
  return {
    day: { current: null, previous: null, delta: null },
    week: { current: null, previous: null, delta: null },
    source: "empty",
  };
}

async function loadBasketTrendSnapshotsFromRpc(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
  vault: Address
) {
  try {
    const currentBlockNumber = await publicClient.getBlockNumber();
    const currentBlock = await publicClient.getBlock({ blockNumber: currentBlockNumber });
    const lookback24hBlock = await findBlockAtOrBeforeTimestamp(publicClient, currentBlock.timestamp - TREND_PERIODS["1d"]);
    const lookback7dBlock = await findBlockAtOrBeforeTimestamp(publicClient, currentBlock.timestamp - TREND_PERIODS["7d"]);

    const [currentState, dayState, weekState] = await Promise.all([
      readBasketTrendStateAtBlock(publicClient, vault, currentBlockNumber, currentBlock.timestamp),
      lookback24hBlock != null
        ? readBasketTrendStateAtBlock(publicClient, vault, lookback24hBlock, currentBlock.timestamp - TREND_PERIODS["1d"])
        : Promise.resolve(null),
      lookback7dBlock != null
        ? readBasketTrendStateAtBlock(publicClient, vault, lookback7dBlock, currentBlock.timestamp - TREND_PERIODS["7d"])
        : Promise.resolve(null),
    ]);

    if (!currentState) {
      return emptyBasketTrendSnapshots();
    }

    return {
      day: buildBasketTrendSeries(currentState, dayState, "1d"),
      week: buildBasketTrendSeries(currentState, weekState, "7d"),
      source: "rpc",
    } satisfies BasketTrendSnapshotsResult;
  } catch {
    return emptyBasketTrendSnapshots();
  }
}

function buildBasketTrendSeries(
  currentState: BasketTrendState,
  previousState: BasketTrendState | null,
  period: BasketSnapshotPeriod
): BasketTrendSeries {
  const current = buildBasketTrendSnapshot(currentState, period);
  const previous = previousState ? buildBasketTrendSnapshot(previousState, period) : null;
  return {
    current,
    previous,
    delta: current && previous ? diffBasketTrendState(current, previous) : null,
  };
}

function buildBasketTrendSnapshot(state: BasketTrendState, period: BasketSnapshotPeriod): BasketTrendSnapshot {
  const periodSeconds = TREND_PERIODS[period];
  const bucketStart = (state.timestamp / periodSeconds) * periodSeconds;
  return {
    ...state,
    period,
    bucketStart,
    bucketEnd: bucketStart + periodSeconds - 1n,
  };
}

async function readBasketTrendStateAtBlock(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
  vault: Address,
  blockNumber: bigint,
  timestamp: bigint
): Promise<BasketTrendState | null> {
  try {
    const shareToken = await publicClient.readContract({
      address: vault,
      abi: BasketVaultABI,
      functionName: "shareToken",
      blockNumber,
    });
    const usdc = await publicClient.readContract({
      address: vault,
      abi: BasketVaultABI,
      functionName: "usdc",
      blockNumber,
    });

    const [
      sharePrice,
      perpAllocatedUsdc,
      requiredReserveUsdc,
      availableForPerpUsdc,
      collectedFeesUsdc,
      minReserveBps,
      depositFeeBps,
      redeemFeeBps,
      assetCount,
      totalSupplyShares,
      usdcBalanceUsdc,
    ] = await Promise.all([
      publicClient.readContract({
        address: vault,
        abi: BasketVaultABI,
        functionName: "getSharePrice",
        blockNumber,
      }),
      publicClient.readContract({
        address: vault,
        abi: BasketVaultABI,
        functionName: "perpAllocated",
        blockNumber,
      }),
      publicClient.readContract({
        address: vault,
        abi: BasketVaultABI,
        functionName: "getRequiredReserveUsdc",
        blockNumber,
      }),
      publicClient.readContract({
        address: vault,
        abi: BasketVaultABI,
        functionName: "getAvailableForPerpUsdc",
        blockNumber,
      }),
      publicClient.readContract({
        address: vault,
        abi: BasketVaultABI,
        functionName: "collectedFees",
        blockNumber,
      }),
      publicClient.readContract({
        address: vault,
        abi: BasketVaultABI,
        functionName: "minReserveBps",
        blockNumber,
      }),
      publicClient.readContract({
        address: vault,
        abi: BasketVaultABI,
        functionName: "depositFeeBps",
        blockNumber,
      }),
      publicClient.readContract({
        address: vault,
        abi: BasketVaultABI,
        functionName: "redeemFeeBps",
        blockNumber,
      }),
      publicClient.readContract({
        address: vault,
        abi: BasketVaultABI,
        functionName: "getAssetCount",
        blockNumber,
      }),
      publicClient.readContract({
        address: shareToken as Address,
        abi: BasketShareTokenABI,
        functionName: "totalSupply",
        blockNumber,
      }),
      publicClient.readContract({
        address: usdc as Address,
        abi: ERC20_BALANCE_OF_ABI,
        functionName: "balanceOf",
        args: [vault],
        blockNumber,
      }),
    ]);

    return {
      timestamp,
      sharePrice: sharePrice as bigint,
      basketPrice: sharePrice as bigint,
      usdcBalanceUsdc: usdcBalanceUsdc as bigint,
      perpAllocatedUsdc: perpAllocatedUsdc as bigint,
      tvlBookUsdc: (usdcBalanceUsdc as bigint) + (perpAllocatedUsdc as bigint),
      totalSupplyShares: totalSupplyShares as bigint,
      assetCount: assetCount as bigint,
      depositFeeBps: depositFeeBps as bigint,
      redeemFeeBps: redeemFeeBps as bigint,
      minReserveBps: minReserveBps as bigint,
      requiredReserveUsdc: requiredReserveUsdc as bigint,
      availableForPerpUsdc: availableForPerpUsdc as bigint,
      collectedFeesUsdc: collectedFeesUsdc as bigint,
      cumulativeFeesCollectedUsdc: collectedFeesUsdc as bigint,
      openInterest: 0n,
      collateralLocked: 0n,
      positionCount: 0n,
    };
  } catch {
    return null;
  }
}

export async function findBlockAtOrBeforeTimestamp(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
  targetTimestamp: bigint
) {
  if (targetTimestamp <= 0n) return 0n;

  const latestBlockNumber = await publicClient.getBlockNumber();
  let low = 0n;
  let high = latestBlockNumber;
  let candidate: bigint | null = null;

  while (low <= high) {
    const mid = (low + high) / 2n;
    const block = await publicClient.getBlock({ blockNumber: mid });
    if (block.timestamp === targetTimestamp) {
      return mid;
    }
    if (block.timestamp < targetTimestamp) {
      candidate = mid;
      low = mid + 1n;
    } else if (mid === 0n) {
      break;
    } else {
      high = mid - 1n;
    }
  }

  return candidate;
}
