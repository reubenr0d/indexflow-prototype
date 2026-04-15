"use client";

import { useQuery } from "@tanstack/react-query";
import { type Address } from "viem";
import { parseBigInt } from "@/lib/subgraph/transform";
import { GET_BASKET_DETAIL, GET_BASKET_ACTIVITIES } from "@/lib/subgraph/queries";
import {
  useAvailableSubgraph,
  type RawBasketDetail,
  type RawBasketAsset,
  type RawBasketExposure,
  type RawBasketActivity,
  type RawVaultStateCurrent,
} from "./useSubgraphShared";

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
    activities: Array<BasketActivityRow>;
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
