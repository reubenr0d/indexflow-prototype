"use client";

import { useMemo } from "react";
import { getSubgraphClient } from "@/lib/subgraph/client";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";

export const DEFAULT_PAGE_SIZE = 100;

export const ERC20_BALANCE_OF_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export function useAvailableSubgraph() {
  const { isSubgraphEnabled, subgraphUrl } = useDeploymentTarget();
  const client = useMemo(
    () => (isSubgraphEnabled ? getSubgraphClient(subgraphUrl) : null),
    [isSubgraphEnabled, subgraphUrl]
  );
  return { client, isAvailable: isSubgraphEnabled && Boolean(client) };
}

export type RawBasketAsset = {
  id: string;
  assetId: string;
  active: boolean;
  updatedAt: string;
};

export type RawBasketExposure = {
  id: string;
  assetId: string;
  longSize: string;
  shortSize: string;
  netSize: string;
  updatedAt: string;
};

export type RawBasketActivity = {
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

export type RawBasketDetail = {
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

export type RawBasketSnapshot = {
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

export type RawVaultStateCurrent = {
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

export type RawUserBasketPosition = {
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

export type RawVaultState = {
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

export type RawOraclePriceUpdate = {
  id: string;
  assetId: string;
  price: string;
  priceTimestamp: string;
  blockNumber: string;
  txHash: string;
  logIndex: string;
  createdAt: string;
};
