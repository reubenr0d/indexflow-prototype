"use client";

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useChainId } from "wagmi";
import { VaultAccountingABI } from "@/abi/contracts";
import { getContracts } from "@/config/contracts";
import { REFETCH_INTERVAL } from "@/lib/constants";
import { type Address } from "viem";

export function useRegisteredVaults() {
  const chainId = useChainId();
  const { vaultAccounting } = getContracts(chainId);

  return useReadContract({
    address: vaultAccounting,
    abi: VaultAccountingABI,
    functionName: "getRegisteredVaultCount",
    query: { refetchInterval: REFETCH_INTERVAL },
  });
}

export function useOpenPosition() {
  const chainId = useChainId();
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
  const chainId = useChainId();
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
  const chainId = useChainId();
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
