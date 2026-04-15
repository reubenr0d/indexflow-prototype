"use client";

import { useMemo } from "react";
import { useBasketInfo, useVaultPnL, useVaultState } from "@/hooks/usePerpReader";
import { useBasketDetailQuery } from "@/hooks/subgraph/useBasketDetail";
import { useBasketTrendSnapshots } from "@/hooks/subgraph/useBasketTrends";
import { computeApy } from "@/lib/apy";
import {
  useBasketFees,
  useMinReserveBps,
  useRequiredReserveUsdc,
  useAvailableForPerpUsdc,
  useCollectedFees,
  useBasketAssets,
} from "@/hooks/useBasketVault";
import { useOracleAssetMetaMap } from "@/hooks/useOracle";
import { useReadContracts } from "wagmi";
import { VaultAccountingABI } from "@/abi/VaultAccounting";
import { computeBlendedComposition, type PerpExposureAsset } from "@/lib/blendedComposition";
import { encodePacked, keccak256, type Address } from "viem";
import { getContracts } from "@/config/contracts";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { REFETCH_INTERVAL } from "@/lib/constants";

export function useBasketDashboardData(vault: Address) {
  const { data: info, isLoading: isInfoLoading } = useBasketInfo(vault);
  const { data: vaultState } = useVaultState(vault);
  const { data: vaultPnL } = useVaultPnL(vault);
  const { depositFee, redeemFee } = useBasketFees(vault);
  const { data: minReserveBps } = useMinReserveBps(vault);
  const { data: requiredReserveUsdc } = useRequiredReserveUsdc(vault);
  const { data: availableForPerpUsdc } = useAvailableForPerpUsdc(vault);
  const { data: collectedFees } = useCollectedFees(vault);
  const { data: onchainBasketAssets } = useBasketAssets(vault);
  const { data: assetMeta } = useOracleAssetMetaMap();
  const { chainId } = useDeploymentTarget();
  const { usdc, vaultAccounting } = getContracts(chainId);

  const basketInfo = info as
    | {
        vault: Address;
        shareToken: Address;
        name: string;
        basketPrice: bigint;
        sharePrice: bigint;
        usdcBalance: bigint;
        perpAllocated: bigint;
        totalSupply: bigint;
        assetCount: bigint;
      }
    | undefined;

  const state = vaultState as
    | {
        depositedCapital: bigint;
        realisedPnL: bigint;
        openInterest: bigint;
        collateralLocked: bigint;
        positionCount: bigint;
        registered: boolean;
      }
    | undefined;

  const pnlResult = vaultPnL as [bigint, bigint] | undefined;
  const unrealisedPnL = pnlResult?.[0] ?? 0n;
  const realisedPnL = pnlResult?.[1] ?? 0n;
  const netPnL = unrealisedPnL + realisedPnL;

  const tvl = (basketInfo?.usdcBalance ?? 0n) + (basketInfo?.perpAllocated ?? 0n);
  const collectedFeesUsdc = (collectedFees as bigint | undefined) ?? 0n;
  const idleUsdc = (basketInfo?.usdcBalance ?? 0n) - collectedFeesUsdc;
  const requiredReserve = (requiredReserveUsdc as bigint | undefined) ?? 0n;
  const availableForPerp = (availableForPerpUsdc as bigint | undefined) ?? 0n;
  const reserveHealthy = idleUsdc >= requiredReserve;

  const capitalUtilPct =
    tvl > 0n ? Number(((basketInfo?.perpAllocated ?? 0n) * 10000n) / tvl) / 100 : 0;
  const leverageRatio =
    state?.depositedCapital && state.depositedCapital > 0n
      ? Number((state.openInterest * 100n) / state.depositedCapital) / 100
      : 0;

  // ---- Configured assets + composition ----

  const basketDetail = useBasketDetailQuery(vault, 1, 0);
  const subgraphConfiguredAssetIds = (basketDetail.data?.basket?.assets ?? [])
    .filter((asset) => asset.active)
    .map((asset) => asset.assetId);
  const exposures = (basketDetail.data?.basket?.exposures ?? []) as PerpExposureAsset[];
  const onchainConfiguredAssetIds = useMemo(
    () =>
      (onchainBasketAssets ?? [])
        .map((entry) => entry.result as `0x${string}` | undefined)
        .filter((id): id is `0x${string}` => Boolean(id)),
    [onchainBasketAssets],
  );
  const configuredAssetIds = useMemo(
    () =>
      Array.from(
        new Set(
          (onchainConfiguredAssetIds.length > 0
            ? onchainConfiguredAssetIds
            : subgraphConfiguredAssetIds
          ).map((id) => id.toLowerCase()),
        ),
      ) as `0x${string}`[],
    [onchainConfiguredAssetIds, subgraphConfiguredAssetIds],
  );

  const positionTrackingKeys = useMemo(
    () =>
      configuredAssetIds.flatMap((assetId) => [
        {
          assetId,
          isLong: true,
          key: keccak256(encodePacked(["address", "bytes32", "bool"], [vault, assetId, true])),
        },
        {
          assetId,
          isLong: false,
          key: keccak256(encodePacked(["address", "bytes32", "bool"], [vault, assetId, false])),
        },
      ]),
    [configuredAssetIds, vault],
  );

  const { data: trackingRows } = useReadContracts({
    contracts: positionTrackingKeys.map((entry) => ({
      address: vaultAccounting,
      abi: VaultAccountingABI,
      functionName: "getPositionTracking" as const,
      args: [entry.key] as const,
    })),
    query: {
      enabled: positionTrackingKeys.length > 0,
      refetchInterval: REFETCH_INTERVAL,
    },
  });

  const onchainExposureRows = useMemo(() => {
    const byAsset = new Map<`0x${string}`, { longSize: bigint; shortSize: bigint }>();
    positionTrackingKeys.forEach((entry, i) => {
      const raw = trackingRows?.[i]?.result;
      if (!raw) return;
      const tracking = raw as
        | { size?: bigint; exists?: boolean }
        | [Address, `0x${string}`, boolean, bigint, bigint, bigint, bigint, bigint, boolean];
      const exists = Array.isArray(tracking) ? Boolean(tracking[8]) : Boolean(tracking.exists);
      const size = Array.isArray(tracking) ? (tracking[3] ?? 0n) : (tracking.size ?? 0n);
      const effectiveSize = exists ? size : 0n;
      const current = byAsset.get(entry.assetId) ?? { longSize: 0n, shortSize: 0n };
      byAsset.set(entry.assetId, {
        longSize: entry.isLong ? effectiveSize : current.longSize,
        shortSize: entry.isLong ? current.shortSize : effectiveSize,
      });
    });
    return Array.from(byAsset.entries())
      .map(([assetId, sizes]) => ({
        assetId,
        longSize: sizes.longSize,
        shortSize: sizes.shortSize,
        netSize: sizes.longSize - sizes.shortSize,
      }))
      .filter(
        (row) => row.longSize > 0n || row.shortSize > 0n || row.netSize !== 0n,
      ) as PerpExposureAsset[];
  }, [positionTrackingKeys, trackingRows]);

  const subgraphHasLiveExposure = exposures.some(
    (row) => row.longSize > 0n || row.shortSize > 0n || row.netSize !== 0n,
  );
  const effectiveExposures =
    subgraphHasLiveExposure || (exposures.length > 0 && onchainExposureRows.length === 0)
      ? exposures
      : onchainExposureRows;

  const blended = computeBlendedComposition(
    basketInfo?.usdcBalance ?? 0n,
    basketInfo?.perpAllocated ?? 0n,
    state?.openInterest ?? 0n,
    effectiveExposures,
  );
  const hasExposureRows = effectiveExposures.length > 0;
  const hasNonZeroAllocation = blended.assetBlend.some((asset) => asset.blendBps > 0n);
  const showAllocatedComposition = hasExposureRows && hasNonZeroAllocation;

  const { data: trendData } = useBasketTrendSnapshots(vault);
  const apy7d =
    trendData?.week?.current && trendData?.week?.previous
      ? computeApy(trendData.week.current.sharePrice, trendData.week.previous.sharePrice, 7)
      : null;

  return {
    basketInfo,
    state,
    isInfoLoading,
    tvl,
    idleUsdc,
    requiredReserve,
    availableForPerp,
    reserveHealthy,
    collectedFeesUsdc,
    depositFee,
    redeemFee,
    minReserveBps: minReserveBps as bigint | undefined,
    unrealisedPnL,
    realisedPnL,
    netPnL,
    capitalUtilPct,
    leverageRatio,
    configuredAssetIds,
    blended,
    showAllocatedComposition,
    assetMeta,
    apy7d,
    usdc,
    chainId,
  };
}
