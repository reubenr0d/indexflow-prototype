"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { PerpReaderABI } from "@/abi/contracts";
import { getContracts } from "@/config/contracts";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { REFETCH_INTERVAL } from "@/lib/constants";
import { type Address } from "viem";

export function useBasketInfo(vault: Address) {
  const { chainId } = useDeploymentTarget();
  const { perpReader } = getContracts(chainId);

  return useReadContract({
    address: perpReader,
    abi: PerpReaderABI,
    functionName: "getBasketInfo",
    args: [vault],
    query: { refetchInterval: REFETCH_INTERVAL },
  });
}

export function useBasketInfoBatch(vaults: Address[]) {
  const { chainId } = useDeploymentTarget();
  const { perpReader } = getContracts(chainId);

  return useReadContract({
    address: perpReader,
    abi: PerpReaderABI,
    functionName: "getBasketInfoBatch",
    args: [vaults],
    query: { enabled: vaults.length > 0, refetchInterval: REFETCH_INTERVAL },
  });
}

export function useVaultState(vault: Address) {
  const { chainId } = useDeploymentTarget();
  const { perpReader } = getContracts(chainId);

  return useReadContract({
    address: perpReader,
    abi: PerpReaderABI,
    functionName: "getVaultState",
    args: [vault],
    query: { refetchInterval: REFETCH_INTERVAL },
  });
}

export function useVaultStateBatch(vaults: Address[]) {
  const { chainId } = useDeploymentTarget();
  const { perpReader } = getContracts(chainId);

  return useReadContracts({
    contracts: vaults.map((vault) => ({
      address: perpReader,
      abi: PerpReaderABI,
      functionName: "getVaultState" as const,
      args: [vault] as const,
    })),
    query: { enabled: vaults.length > 0, refetchInterval: REFETCH_INTERVAL },
  });
}

export function useVaultPnL(vault: Address) {
  const { chainId } = useDeploymentTarget();
  const { perpReader } = getContracts(chainId);

  return useReadContract({
    address: perpReader,
    abi: PerpReaderABI,
    functionName: "getVaultPnL",
    args: [vault],
    query: { refetchInterval: REFETCH_INTERVAL },
  });
}

export function useTotalVaultValue(vault: Address) {
  const { chainId } = useDeploymentTarget();
  const { perpReader } = getContracts(chainId);

  return useReadContract({
    address: perpReader,
    abi: PerpReaderABI,
    functionName: "getTotalVaultValue",
    args: [vault],
    query: { refetchInterval: REFETCH_INTERVAL },
  });
}

export function useOraclePrice(assetId: `0x${string}`) {
  const { chainId } = useDeploymentTarget();
  const { perpReader } = getContracts(chainId);

  return useReadContract({
    address: perpReader,
    abi: PerpReaderABI,
    functionName: "getOraclePrice",
    args: [assetId],
    query: { refetchInterval: REFETCH_INTERVAL },
  });
}

export function usePoolUtilization(token: Address) {
  const { chainId } = useDeploymentTarget();
  const { perpReader } = getContracts(chainId);

  return useReadContract({
    address: perpReader,
    abi: PerpReaderABI,
    functionName: "getPoolUtilization",
    args: [token],
    query: { refetchInterval: REFETCH_INTERVAL },
  });
}
