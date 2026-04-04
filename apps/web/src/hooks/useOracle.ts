"use client";

import { useReadContract } from "wagmi";
import { useChainId } from "wagmi";
import { OracleAdapterABI } from "@/abi/contracts";
import { getContracts } from "@/config/contracts";
import { REFETCH_INTERVAL } from "@/lib/constants";

export function useOracleAssetCount() {
  const chainId = useChainId();
  const { oracleAdapter } = getContracts(chainId);

  return useReadContract({
    address: oracleAdapter,
    abi: OracleAdapterABI,
    functionName: "getAssetCount",
    query: { refetchInterval: REFETCH_INTERVAL },
  });
}

export function useOracleAssetPrice(assetId: `0x${string}`) {
  const chainId = useChainId();
  const { oracleAdapter } = getContracts(chainId);

  return useReadContract({
    address: oracleAdapter,
    abi: OracleAdapterABI,
    functionName: "getPrice",
    args: [assetId],
    query: { refetchInterval: REFETCH_INTERVAL },
  });
}

export function useOracleIsStale(assetId: `0x${string}`) {
  const chainId = useChainId();
  const { oracleAdapter } = getContracts(chainId);

  return useReadContract({
    address: oracleAdapter,
    abi: OracleAdapterABI,
    functionName: "isStale",
    args: [assetId],
    query: { refetchInterval: REFETCH_INTERVAL },
  });
}

export function useOracleAssetConfig(assetId: `0x${string}`) {
  const chainId = useChainId();
  const { oracleAdapter } = getContracts(chainId);

  return useReadContract({
    address: oracleAdapter,
    abi: OracleAdapterABI,
    functionName: "getAssetConfig",
    args: [assetId],
    query: { refetchInterval: REFETCH_INTERVAL },
  });
}
