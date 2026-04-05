"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { type Address } from "viem";
import { getSubgraphClient, getSubgraphUrl } from "@/lib/subgraph/client";
import { parseBigInt, toBasketOverviewRows, toUserPortfolioRows } from "@/lib/subgraph/transform";
import {
  GET_ADMIN_VAULT_STATES,
  GET_BASKET_DETAIL,
  GET_BASKETS_OVERVIEW,
  GET_USER_PORTFOLIO,
} from "@/lib/subgraph/queries";

const DEFAULT_PAGE_SIZE = 100;

type RawBasketAsset = {
  id: string;
  assetId: string;
  weightBps: string;
  active: boolean;
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
  activities?: RawBasketActivity[] | null;
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
  const client = useMemo(() => getSubgraphClient(), []);
  const isAvailable = Boolean(getSubgraphUrl());
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
      weightBps: bigint;
      active: boolean;
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

export function useBasketDetailQuery(vault: Address | undefined, activityFirst = 20) {
  const client = useMemo(() => getSubgraphClient(), []);
  const isAvailable = Boolean(getSubgraphUrl());

  return useQuery({
    queryKey: ["subgraph", "basketDetail", vault, activityFirst],
    queryFn: async (): Promise<BasketDetail | null> => {
      if (!client || !vault) return null;

      const result = await client.request<{
        basket: RawBasketDetail | null;
        vaultStateCurrent: RawVaultStateCurrent | null;
      }>(GET_BASKET_DETAIL, {
        id: vault.toLowerCase(),
        activityFirst,
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
            weightBps: parseBigInt(a.weightBps),
            active: Boolean(a.active),
            updatedAt: parseBigInt(a.updatedAt),
          })),
          activities: (result.basket.activities ?? []).map((a: RawBasketActivity) => ({
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
  const client = useMemo(() => getSubgraphClient(), []);
  const isAvailable = Boolean(getSubgraphUrl());

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
  const client = useMemo(() => getSubgraphClient(), []);
  const isAvailable = Boolean(getSubgraphUrl());
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
