"use client";

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { VaultAccountingABI } from "@/abi/contracts";
import { getContracts } from "@/config/contracts";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { REFETCH_INTERVAL } from "@/lib/constants";
import { encodePacked, keccak256, type Address, type Hex } from "viem";

export function useRegisteredVaults() {
  const { chainId } = useDeploymentTarget();
  const { vaultAccounting } = getContracts(chainId);

  return useReadContract({
    address: vaultAccounting,
    abi: VaultAccountingABI,
    functionName: "getRegisteredVaultCount",
    query: { refetchInterval: REFETCH_INTERVAL },
  });
}

export function useOpenPosition() {
  const { chainId } = useDeploymentTarget();
  const { vaultAccounting } = getContracts(chainId);
  const { writeContract, data: hash, ...rest } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  const openPosition = (
    vault: Address,
    asset: `0x${string}`,
    isLong: boolean,
    size: bigint,
    collateral: bigint
  ) => {
    writeContract({
      address: vaultAccounting,
      abi: VaultAccountingABI,
      functionName: "openPosition",
      args: [vault, asset, isLong, size, collateral],
    });
  };

  return { openPosition, hash, receipt, ...rest };
}

export function useClosePosition() {
  const { chainId } = useDeploymentTarget();
  const { vaultAccounting } = getContracts(chainId);
  const { writeContract, data: hash, ...rest } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  const closePosition = (
    vault: Address,
    asset: `0x${string}`,
    isLong: boolean,
    sizeDelta: bigint,
    collateralDelta: bigint
  ) => {
    writeContract({
      address: vaultAccounting,
      abi: VaultAccountingABI,
      functionName: "closePosition",
      args: [vault, asset, isLong, sizeDelta, collateralDelta],
    });
  };

  return { closePosition, hash, receipt, ...rest };
}

export function useRegisterVault() {
  const { chainId } = useDeploymentTarget();
  const { vaultAccounting } = getContracts(chainId);
  const { writeContract, data: hash, ...rest } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  const registerVault = (vault: Address) => {
    writeContract({
      address: vaultAccounting,
      abi: VaultAccountingABI,
      functionName: "registerVault",
      args: [vault],
    });
  };

  return { registerVault, hash, receipt, ...rest };
}

export function useDeregisterVault() {
  const { chainId } = useDeploymentTarget();
  const { vaultAccounting } = getContracts(chainId);
  const { writeContract, data: hash, ...rest } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  const deregisterVault = (vault: Address) => {
    writeContract({
      address: vaultAccounting,
      abi: VaultAccountingABI,
      functionName: "deregisterVault",
      args: [vault],
    });
  };

  return { deregisterVault, hash, receipt, ...rest };
}

export function useIsVaultRegistered(vault: Address | undefined) {
  const { chainId } = useDeploymentTarget();
  const { vaultAccounting } = getContracts(chainId);

  return useReadContract({
    address: vaultAccounting,
    abi: VaultAccountingABI,
    functionName: "isVaultRegistered",
    args: vault ? [vault] : undefined,
    query: {
      enabled: !!vault,
      refetchInterval: REFETCH_INTERVAL,
    },
  });
}

// ─── Risk Controls ───────────────────────────────────────────

export function usePaused() {
  const { chainId } = useDeploymentTarget();
  const { vaultAccounting } = getContracts(chainId);

  return useReadContract({
    address: vaultAccounting,
    abi: VaultAccountingABI,
    functionName: "paused",
    query: { refetchInterval: REFETCH_INTERVAL },
  });
}

export function useMaxOpenInterest(vault: Address | undefined) {
  const { chainId } = useDeploymentTarget();
  const { vaultAccounting } = getContracts(chainId);

  return useReadContract({
    address: vaultAccounting,
    abi: VaultAccountingABI,
    functionName: "maxOpenInterest",
    args: vault ? [vault] : undefined,
    query: {
      enabled: !!vault,
      refetchInterval: REFETCH_INTERVAL,
    },
  });
}

export function useMaxPositionSize(vault: Address | undefined) {
  const { chainId } = useDeploymentTarget();
  const { vaultAccounting } = getContracts(chainId);

  return useReadContract({
    address: vaultAccounting,
    abi: VaultAccountingABI,
    functionName: "maxPositionSize",
    args: vault ? [vault] : undefined,
    query: {
      enabled: !!vault,
      refetchInterval: REFETCH_INTERVAL,
    },
  });
}

export function useSetPaused() {
  const { chainId } = useDeploymentTarget();
  const { vaultAccounting } = getContracts(chainId);
  const { writeContract, data: hash, ...rest } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  const setPaused = (paused: boolean) => {
    writeContract({
      address: vaultAccounting,
      abi: VaultAccountingABI,
      functionName: "setPaused",
      args: [paused],
    });
  };

  return { setPaused, hash, receipt, ...rest };
}

export function useSetMaxOpenInterest() {
  const { chainId } = useDeploymentTarget();
  const { vaultAccounting } = getContracts(chainId);
  const { writeContract, data: hash, ...rest } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  const setMaxOpenInterest = (vault: Address, cap: bigint) => {
    writeContract({
      address: vaultAccounting,
      abi: VaultAccountingABI,
      functionName: "setMaxOpenInterest",
      args: [vault, cap],
    });
  };

  return { setMaxOpenInterest, hash, receipt, ...rest };
}

export function useSetMaxPositionSize() {
  const { chainId } = useDeploymentTarget();
  const { vaultAccounting } = getContracts(chainId);
  const { writeContract, data: hash, ...rest } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  const setMaxPositionSize = (vault: Address, cap: bigint) => {
    writeContract({
      address: vaultAccounting,
      abi: VaultAccountingABI,
      functionName: "setMaxPositionSize",
      args: [vault, cap],
    });
  };

  return { setMaxPositionSize, hash, receipt, ...rest };
}

export function usePositionTracking(vault: Address | undefined, asset: Hex | undefined, isLong: boolean) {
  const { chainId } = useDeploymentTarget();
  const { vaultAccounting } = getContracts(chainId);

  const key =
    vault && asset
      ? keccak256(encodePacked(["address", "bytes32", "bool"], [vault, asset, isLong]))
      : undefined;

  return useReadContract({
    address: vaultAccounting,
    abi: VaultAccountingABI,
    functionName: "getPositionTracking",
    args: key ? [key] : undefined,
    query: {
      enabled: !!key,
      refetchInterval: REFETCH_INTERVAL,
    },
  });
}
