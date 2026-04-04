"use client";

import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { useChainId } from "wagmi";
import { OracleAdapterABI, PricingEngineABI } from "@/abi/contracts";
import { getContracts } from "@/config/contracts";
import { PRICE_PRECISION, USDC_PRECISION, REFETCH_INTERVAL } from "@/lib/constants";
import { usePoolUtilization } from "@/hooks/usePerpReader";
import { type Address } from "viem";

export const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/// Convert USDC atom amount (6 decimals) to USD notionals scaled by PRICE_PRECISION (1e30), matching GMX / PricingEngine tests.
export function usdcAtomsToUsd1e30(usdcAtoms: bigint): bigint {
  if (usdcAtoms === 0n) return 0n;
  return (usdcAtoms * PRICE_PRECISION) / USDC_PRECISION;
}

export type PricingQuoteArgs = {
  assetId: `0x${string}` | undefined;
  /** Position notional as USDC atoms (6 decimals). */
  sizeUsdcAtoms: bigint;
  isLong: boolean;
  enabled?: boolean;
};

function useValidAssetId(assetId: `0x${string}` | undefined) {
  return assetId && assetId !== ZERO_BYTES32 ? assetId : undefined;
}

/**
 * Indicative execution price from PricingEngine (oracle ± deterministic size/liquidity impact).
 * Liquidity = GMX USDC poolAmount in USD 1e30. GMX settlement may still differ.
 */
export function usePricingExecutionQuote({
  assetId,
  sizeUsdcAtoms,
  isLong,
  enabled = true,
}: PricingQuoteArgs) {
  const chainId = useChainId();
  const { usdc, pricingEngine, oracleAdapter } = getContracts(chainId);
  const { data: poolRaw, isLoading: poolLoading } = usePoolUtilization(usdc);

  const pool = poolRaw as { poolAmount: bigint } | undefined;

  const validId = useValidAssetId(assetId);

  const { data: isStale } = useReadContract({
    address: oracleAdapter,
    abi: OracleAdapterABI,
    functionName: "isStale",
    args: [validId ?? ZERO_BYTES32],
    query: {
      enabled: Boolean(validId),
      refetchInterval: REFETCH_INTERVAL,
    },
  });

  const liquidityUsd1e30 = useMemo(() => {
    if (!pool) return 0n;
    return usdcAtomsToUsd1e30(pool.poolAmount);
  }, [pool]);

  const sizeUsd1e30 = useMemo(() => usdcAtomsToUsd1e30(sizeUsdcAtoms), [sizeUsdcAtoms]);

  const canQuery =
    enabled &&
    Boolean(validId) &&
    pricingEngine !== "0x0000000000000000000000000000000000000000" &&
    isStale !== true;

  const { data: impactBps, isLoading: impactLoading } = useReadContract({
    address: pricingEngine as Address,
    abi: PricingEngineABI,
    functionName: "calculateImpact",
    args: [validId ?? ZERO_BYTES32, sizeUsd1e30, liquidityUsd1e30],
    query: {
      enabled: canQuery && sizeUsd1e30 > 0n,
    },
  });

  const { data: executionPrice, isLoading: execLoading, error: execError } = useReadContract({
    address: pricingEngine as Address,
    abi: PricingEngineABI,
    functionName: "getExecutionPrice",
    args: [validId ?? ZERO_BYTES32, sizeUsd1e30, liquidityUsd1e30, isLong],
    query: {
      enabled: canQuery,
    },
  });

  const isLoading = poolLoading || (canQuery && (impactLoading || execLoading));

  return {
    executionPrice: executionPrice as bigint | undefined,
    impactBps: impactBps as bigint | undefined,
    liquidityUsd1e30,
    sizeUsd1e30,
    isStale: isStale === true,
    isLoading,
    error: execError,
    canQuery,
  };
}

export type PoolLiquidityUsd = {
  liquidityUsd1e30: bigint;
  poolLoading: boolean;
};

/** Shared pool → USD 1e30 for multiple quote rows (e.g. prices page). */
export function usePoolLiquidityUsd1e30(): PoolLiquidityUsd {
  const chainId = useChainId();
  const { usdc } = getContracts(chainId);
  const { data: poolRaw, isLoading: poolLoading } = usePoolUtilization(usdc);
  const pool = poolRaw as { poolAmount: bigint } | undefined;
  const liquidityUsd1e30 = useMemo(() => {
    if (!pool) return 0n;
    return usdcAtomsToUsd1e30(pool.poolAmount);
  }, [pool]);
  return { liquidityUsd1e30, poolLoading };
}

export type BothSidesQuoteArgs = {
  assetId: `0x${string}` | undefined;
  sizeUsdcAtoms: bigint;
  liquidityUsd1e30: bigint;
  enabled?: boolean;
};

/** Long and short indicative execution prices for one asset (batch RPC). */
export function usePricingExecutionQuoteBothSides({
  assetId,
  sizeUsdcAtoms,
  liquidityUsd1e30,
  enabled = true,
}: BothSidesQuoteArgs) {
  const chainId = useChainId();
  const { pricingEngine, oracleAdapter } = getContracts(chainId);
  const validId = useValidAssetId(assetId);
  const sizeUsd1e30 = useMemo(() => usdcAtomsToUsd1e30(sizeUsdcAtoms), [sizeUsdcAtoms]);

  const { data: isStale } = useReadContract({
    address: oracleAdapter,
    abi: OracleAdapterABI,
    functionName: "isStale",
    args: [validId ?? ZERO_BYTES32],
    query: {
      enabled: Boolean(validId),
      refetchInterval: REFETCH_INTERVAL,
    },
  });

  const canQuery =
    enabled &&
    Boolean(validId) &&
    pricingEngine !== "0x0000000000000000000000000000000000000000" &&
    isStale !== true &&
    sizeUsd1e30 > 0n;

  const { data, isLoading, error } = useReadContracts({
    contracts: [
      {
        address: pricingEngine as Address,
        abi: PricingEngineABI,
        functionName: "getExecutionPrice",
        args: [validId ?? ZERO_BYTES32, sizeUsd1e30, liquidityUsd1e30, true],
      },
      {
        address: pricingEngine as Address,
        abi: PricingEngineABI,
        functionName: "getExecutionPrice",
        args: [validId ?? ZERO_BYTES32, sizeUsd1e30, liquidityUsd1e30, false],
      },
      {
        address: pricingEngine as Address,
        abi: PricingEngineABI,
        functionName: "calculateImpact",
        args: [validId ?? ZERO_BYTES32, sizeUsd1e30, liquidityUsd1e30],
      },
    ],
    query: {
      enabled: canQuery,
      refetchInterval: REFETCH_INTERVAL,
    },
  });

  const execLong = data?.[0]?.result as bigint | undefined;
  const execShort = data?.[1]?.result as bigint | undefined;
  const impactBps = data?.[2]?.result as bigint | undefined;

  return {
    execLong,
    execShort,
    impactBps,
    isStale: isStale === true,
    isLoading,
    error,
    canQuery,
  };
}
