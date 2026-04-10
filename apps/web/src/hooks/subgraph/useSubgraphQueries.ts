"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { type Address } from "viem";
import { usePublicClient } from "wagmi";
import { BasketShareTokenABI, BasketVaultABI } from "@/abi/contracts";
import { getSubgraphClient } from "@/lib/subgraph/client";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { parseBigInt, toBasketOverviewRows, toUserPortfolioRows } from "@/lib/subgraph/transform";
import {
  GET_ADMIN_VAULT_STATES,
  GET_ORACLE_PRICE_UPDATES,
  GET_BASKET_ACTIVITIES,
  GET_BASKET_DETAIL,
  GET_BASKET_TREND_SNAPSHOTS,
  GET_BASKETS_OVERVIEW,
  GET_SHARE_PRICE_HISTORY,
  GET_USER_PORTFOLIO,
} from "@/lib/subgraph/queries";

const DEFAULT_PAGE_SIZE = 100;
const ERC20_BALANCE_OF_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

function useAvailableSubgraph() {
  const { isSubgraphEnabled } = useDeploymentTarget();
  const client = useMemo(
    () => (isSubgraphEnabled ? getSubgraphClient() : null),
    [isSubgraphEnabled]
  );
  return { client, isAvailable: isSubgraphEnabled && Boolean(client) };
}

type RawBasketAsset = {
  id: string;
  assetId: string;
  active: boolean;
  updatedAt: string;
};

type RawBasketExposure = {
  id: string;
  assetId: string;
  longSize: string;
  shortSize: string;
  netSize: string;
  updatedAt: string;
};

type RawBasketActivity = {
  id: string;
  activityType: string;
  user?: { id: string } | null;
  assetId?: string | null;
  isLong?: boolean | null;
  amountUsdc?: string | null;
  shares?: string | null;
  size?: string | null;
  collateral?: string | null;
  pnl?: string | null;
  recipient?: string | null;
  timestamp: string;
  txHash: string;
};

type RawBasketDetail = {
  id: string;
  name?: string | null;
  vault?: string | null;
  shareToken: string;
  assetCount: string;
  basketPrice: string;
  sharePrice: string;
  usdcBalanceUsdc: string;
  perpAllocatedUsdc: string;
  tvlBookUsdc: string;
  totalSupplyShares: string;
  depositFeeBps: string;
  redeemFeeBps: string;
  minReserveBps: string;
  maxPerpAllocation: string;
  assets?: RawBasketAsset[] | null;
  exposures?: RawBasketExposure[] | null;
  activities?: RawBasketActivity[] | null;
};

type RawBasketSnapshot = {
  id: string;
  period: string;
  bucketStart: string;
  bucketEnd: string;
  createdAt: string;
  updatedAt: string;
  sharePrice: string;
  basketPrice: string;
  usdcBalanceUsdc: string;
  perpAllocatedUsdc: string;
  tvlBookUsdc: string;
  totalSupplyShares: string;
  assetCount: string;
  depositFeeBps: string;
  redeemFeeBps: string;
  minReserveBps: string;
  requiredReserveUsdc: string;
  availableForPerpUsdc: string;
  collectedFeesUsdc: string;
  cumulativeFeesCollectedUsdc: string;
  openInterest: string;
  collateralLocked: string;
  positionCount: string;
};

type RawVaultStateCurrent = {
  id: string;
  registered: boolean;
  paused: boolean;
  depositedCapital: string;
  realisedPnl: string;
  openInterest: string;
  positionCount: string;
  collateralLocked: string;
  updatedAt: string;
};

type RawUserBasketPosition = {
  id: string;
  shareBalance: string;
  netDepositedUsdc: string;
  netRedeemedUsdc: string;
  basket: {
    id: string;
    vault?: string | null;
    name?: string | null;
    shareToken: string;
    sharePrice: string;
    basketPrice: string;
  };
};

type RawVaultState = {
  id: string;
  registered: boolean;
  paused: boolean;
  depositedCapital: string;
  realisedPnl: string;
  openInterest: string;
  positionCount: string;
  collateralLocked: string;
  updatedAt: string;
  basket: {
    id: string;
    name?: string | null;
    vault?: string | null;
    tvlBookUsdc: string;
    perpAllocatedUsdc: string;
  };
};

type RawOraclePriceUpdate = {
  id: string;
  assetId: string;
  price: string;
  priceTimestamp: string;
  blockNumber: string;
  txHash: string;
  logIndex: string;
  createdAt: string;
};

export type BasketOverview = {
  vault: Address;
  name: string;
  shareToken: Address;
  assetCount: bigint;
  basketPrice: bigint;
  sharePrice: bigint;
  usdcBalance: bigint;
  perpAllocated: bigint;
  tvlBookUsdc: bigint;
  totalSupply: bigint;
  createdAt: bigint;
  updatedAt: bigint;
};

export function useBasketsOverviewQuery(params?: { first?: number; skip?: number }) {
  const { client, isAvailable } = useAvailableSubgraph();
  const first = params?.first ?? DEFAULT_PAGE_SIZE;
  const skip = params?.skip ?? 0;

  return useQuery({
    queryKey: ["subgraph", "basketsOverview", first, skip],
    queryFn: async () => {
      if (!client) return null;
      const result = await client.request<{ baskets: Array<Record<string, string>> }>(
        GET_BASKETS_OVERVIEW,
        { first, skip }
      );

      return toBasketOverviewRows(result.baskets) as BasketOverview[];
    },
    enabled: isAvailable,
    staleTime: 15_000,
    retry: 1,
  });
}

export type BasketDetail = {
  basket: {
    id: Address;
    name: string;
    vault: Address;
    shareToken: Address;
    assetCount: bigint;
    basketPrice: bigint;
    sharePrice: bigint;
    usdcBalance: bigint;
    perpAllocated: bigint;
    tvlBookUsdc: bigint;
    totalSupply: bigint;
    depositFeeBps: bigint;
    redeemFeeBps: bigint;
    minReserveBps: bigint;
    maxPerpAllocation: bigint;
    assets: Array<{
      id: string;
      assetId: `0x${string}`;
      active: boolean;
      updatedAt: bigint;
    }>;
    exposures: Array<{
      id: string;
      assetId: `0x${string}`;
      longSize: bigint;
      shortSize: bigint;
      netSize: bigint;
      updatedAt: bigint;
    }>;
    activities: Array<{
      id: string;
      activityType: string;
      userId?: Address;
      assetId?: `0x${string}`;
      isLong?: boolean;
      amountUsdc?: bigint;
      shares?: bigint;
      size?: bigint;
      collateral?: bigint;
      pnl?: bigint;
      recipient?: Address;
      timestamp: bigint;
      txHash: `0x${string}`;
    }>;
  } | null;
  vaultStateCurrent: {
    id: Address;
    registered: boolean;
    paused: boolean;
    depositedCapital: bigint;
    realisedPnl: bigint;
    openInterest: bigint;
    positionCount: bigint;
    collateralLocked: bigint;
    updatedAt: bigint;
  } | null;
};

export type BasketActivityRow = {
  id: string;
  activityType: string;
  userId?: Address;
  assetId?: `0x${string}`;
  isLong?: boolean;
  amountUsdc?: bigint;
  shares?: bigint;
  size?: bigint;
  collateral?: bigint;
  pnl?: bigint;
  recipient?: Address;
  timestamp: bigint;
  txHash: `0x${string}`;
};

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

export function useBasketDetailQuery(vault: Address | undefined, activityFirst = 20, activitySkip = 0) {
  const { client, isAvailable } = useAvailableSubgraph();

  return useQuery({
    queryKey: ["subgraph", "basketDetail", vault, activityFirst, activitySkip],
    queryFn: async (): Promise<BasketDetail | null> => {
      if (!client || !vault) return null;

      const result = await client.request<{
        basket: RawBasketDetail | null;
        vaultStateCurrent: RawVaultStateCurrent | null;
      }>(GET_BASKET_DETAIL, {
        id: vault.toLowerCase(),
        activityFirst,
        activitySkip,
      });

      if (!result.basket) {
        return { basket: null, vaultStateCurrent: null };
      }

      return {
        basket: {
          id: result.basket.id as Address,
          name: result.basket.name ?? "",
          vault: (result.basket.vault ?? result.basket.id) as Address,
          shareToken: result.basket.shareToken as Address,
          assetCount: parseBigInt(result.basket.assetCount),
          basketPrice: parseBigInt(result.basket.basketPrice),
          sharePrice: parseBigInt(result.basket.sharePrice),
          usdcBalance: parseBigInt(result.basket.usdcBalanceUsdc),
          perpAllocated: parseBigInt(result.basket.perpAllocatedUsdc),
          tvlBookUsdc: parseBigInt(result.basket.tvlBookUsdc),
          totalSupply: parseBigInt(result.basket.totalSupplyShares),
          depositFeeBps: parseBigInt(result.basket.depositFeeBps),
          redeemFeeBps: parseBigInt(result.basket.redeemFeeBps),
          minReserveBps: parseBigInt(result.basket.minReserveBps),
          maxPerpAllocation: parseBigInt(result.basket.maxPerpAllocation),
          assets: (result.basket.assets ?? []).map((a: RawBasketAsset) => ({
            id: a.id,
            assetId: a.assetId as `0x${string}`,
            active: Boolean(a.active),
            updatedAt: parseBigInt(a.updatedAt),
          })),
          exposures: (result.basket.exposures ?? []).map((e: RawBasketExposure) => ({
            id: e.id,
            assetId: e.assetId as `0x${string}`,
            longSize: parseBigInt(e.longSize),
            shortSize: parseBigInt(e.shortSize),
            netSize: parseBigInt(e.netSize),
            updatedAt: parseBigInt(e.updatedAt),
          })),
          activities: (result.basket.activities ?? []).map((a: RawBasketActivity): BasketActivityRow => ({
            id: a.id,
            activityType: a.activityType,
            userId: a.user?.id as Address | undefined,
            assetId: a.assetId as `0x${string}` | undefined,
            isLong: a.isLong ?? undefined,
            amountUsdc: a.amountUsdc ? parseBigInt(a.amountUsdc) : undefined,
            shares: a.shares ? parseBigInt(a.shares) : undefined,
            size: a.size ? parseBigInt(a.size) : undefined,
            collateral: a.collateral ? parseBigInt(a.collateral) : undefined,
            pnl: a.pnl ? parseBigInt(a.pnl) : undefined,
            recipient: a.recipient as Address | undefined,
            timestamp: parseBigInt(a.timestamp),
            txHash: a.txHash as `0x${string}`,
          })),
        },
        vaultStateCurrent: result.vaultStateCurrent
          ? {
              id: result.vaultStateCurrent.id as Address,
              registered: Boolean(result.vaultStateCurrent.registered),
              paused: Boolean(result.vaultStateCurrent.paused),
              depositedCapital: parseBigInt(result.vaultStateCurrent.depositedCapital),
              realisedPnl: parseBigInt(result.vaultStateCurrent.realisedPnl),
              openInterest: parseBigInt(result.vaultStateCurrent.openInterest),
              positionCount: parseBigInt(result.vaultStateCurrent.positionCount),
              collateralLocked: parseBigInt(result.vaultStateCurrent.collateralLocked),
              updatedAt: parseBigInt(result.vaultStateCurrent.updatedAt),
            }
          : null,
      };
    },
    enabled: isAvailable && Boolean(vault),
    staleTime: 15_000,
    retry: 1,
  });
}

export function useBasketActivitiesQuery(vault: Address | undefined, first = 20, skip = 0) {
  const { client, isAvailable } = useAvailableSubgraph();

  return useQuery({
    queryKey: ["subgraph", "basketActivities", vault, first, skip],
    queryFn: async (): Promise<BasketActivityRow[] | null> => {
      if (!client || !vault) return null;
      const result = await client.request<{ basketActivities: RawBasketActivity[] }>(GET_BASKET_ACTIVITIES, {
        id: vault.toLowerCase(),
        first,
        skip,
      });

      return result.basketActivities.map((a: RawBasketActivity): BasketActivityRow => ({
        id: a.id,
        activityType: a.activityType,
        userId: a.user?.id as Address | undefined,
        assetId: a.assetId as `0x${string}` | undefined,
        isLong: a.isLong ?? undefined,
        amountUsdc: a.amountUsdc ? parseBigInt(a.amountUsdc) : undefined,
        shares: a.shares ? parseBigInt(a.shares) : undefined,
        size: a.size ? parseBigInt(a.size) : undefined,
        collateral: a.collateral ? parseBigInt(a.collateral) : undefined,
        pnl: a.pnl ? parseBigInt(a.pnl) : undefined,
        recipient: a.recipient as Address | undefined,
        timestamp: parseBigInt(a.timestamp),
        txHash: a.txHash as `0x${string}`,
      }));
    },
    enabled: isAvailable && Boolean(vault),
    staleTime: 15_000,
    retry: 1,
  });
}

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

const TREND_PERIODS: Record<BasketSnapshotPeriod, bigint> = {
  "1d": BigInt(24 * 60 * 60),
  "7d": BigInt(7 * 24 * 60 * 60),
};

export function useBasketTrendSnapshots(vault: Address | undefined) {
  const { chainId, isSubgraphEnabled } = useDeploymentTarget();
  const client = useMemo(
    () => (isSubgraphEnabled ? getSubgraphClient() : null),
    [isSubgraphEnabled]
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

async function findBlockAtOrBeforeTimestamp(
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

export type UserPortfolioHolding = {
  id: string;
  vault: Address;
  name: string;
  shareToken: Address;
  sharePrice: bigint;
  basketPrice: bigint;
  shareBalance: bigint;
  valueUsdc: bigint;
  netDepositedUsdc: bigint;
  netRedeemedUsdc: bigint;
};

export function useUserPortfolioQuery(userAddress: Address | undefined, first = DEFAULT_PAGE_SIZE) {
  const { client, isAvailable } = useAvailableSubgraph();

  return useQuery({
    queryKey: ["subgraph", "userPortfolio", userAddress, first],
    queryFn: async () => {
      if (!client || !userAddress) return null;

      const result = await client.request<{ userBasketPositions: RawUserBasketPosition[] }>(GET_USER_PORTFOLIO, {
        userId: userAddress.toLowerCase(),
        first,
      });

      return toUserPortfolioRows(result.userBasketPositions as unknown as Array<Record<string, unknown>>) as {
        holdings: UserPortfolioHolding[];
        totalValueUsdc: bigint;
      };
    },
    enabled: isAvailable && Boolean(userAddress),
    staleTime: 15_000,
    retry: 1,
  });
}

export type AdminVaultState = {
  id: Address;
  registered: boolean;
  paused: boolean;
  depositedCapital: bigint;
  realisedPnl: bigint;
  openInterest: bigint;
  positionCount: bigint;
  collateralLocked: bigint;
  updatedAt: bigint;
  basket: {
    id: Address;
    name: string;
    vault: Address;
    tvlBookUsdc: bigint;
    perpAllocatedUsdc: bigint;
  };
};

export function useVaultStatesQuery(params?: { first?: number; skip?: number }) {
  const { client, isAvailable } = useAvailableSubgraph();
  const first = params?.first ?? DEFAULT_PAGE_SIZE;
  const skip = params?.skip ?? 0;

  return useQuery({
    queryKey: ["subgraph", "vaultStates", first, skip],
    queryFn: async () => {
      if (!client) return null;
      const result = await client.request<{ vaultStateCurrents: RawVaultState[] }>(GET_ADMIN_VAULT_STATES, {
        first,
        skip,
      });

      return result.vaultStateCurrents.map((v: RawVaultState) => ({
        id: v.id as Address,
        registered: Boolean(v.registered),
        paused: Boolean(v.paused),
        depositedCapital: parseBigInt(v.depositedCapital),
        realisedPnl: parseBigInt(v.realisedPnl),
        openInterest: parseBigInt(v.openInterest),
        positionCount: parseBigInt(v.positionCount),
        collateralLocked: parseBigInt(v.collateralLocked),
        updatedAt: parseBigInt(v.updatedAt),
        basket: {
          id: v.basket.id as Address,
          name: v.basket.name ?? "",
          vault: (v.basket.vault ?? v.basket.id) as Address,
          tvlBookUsdc: parseBigInt(v.basket.tvlBookUsdc),
          perpAllocatedUsdc: parseBigInt(v.basket.perpAllocatedUsdc),
        },
      })) as AdminVaultState[];
    },
    enabled: isAvailable,
    staleTime: 15_000,
    retry: 1,
  });
}

// ─── Share Price History ────────────────────────────────────

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
  const { chainId, isSubgraphEnabled } = useDeploymentTarget();
  const client = useMemo(
    () => (isSubgraphEnabled ? getSubgraphClient() : null),
    [isSubgraphEnabled]
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
