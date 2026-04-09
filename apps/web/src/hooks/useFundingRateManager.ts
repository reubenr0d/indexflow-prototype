"use client";

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { type Address } from "viem";
import { FundingRateManagerABI } from "@/abi/contracts";
import { getContracts } from "@/config/contracts";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { REFETCH_INTERVAL } from "@/lib/constants";

export function useFundingOwner() {
  const { chainId } = useDeploymentTarget();
  const { fundingRateManager } = getContracts(chainId);

  return useReadContract({
    address: fundingRateManager,
    abi: FundingRateManagerABI,
    functionName: "owner",
    query: { refetchInterval: REFETCH_INTERVAL },
  });
}

export function useFundingInterval() {
  const { chainId } = useDeploymentTarget();
  const { fundingRateManager } = getContracts(chainId);

  return useReadContract({
    address: fundingRateManager,
    abi: FundingRateManagerABI,
    functionName: "fundingInterval",
    query: { refetchInterval: REFETCH_INTERVAL },
  });
}

export function useDefaultFundingFactors() {
  const { chainId } = useDeploymentTarget();
  const { fundingRateManager } = getContracts(chainId);

  const base = useReadContract({
    address: fundingRateManager,
    abi: FundingRateManagerABI,
    functionName: "defaultBaseFundingRateFactor",
    query: { refetchInterval: REFETCH_INTERVAL },
  });

  const max = useReadContract({
    address: fundingRateManager,
    abi: FundingRateManagerABI,
    functionName: "defaultMaxFundingRateFactor",
    query: { refetchInterval: REFETCH_INTERVAL },
  });

  return {
    base,
    max,
  };
}

export function useFundingKeeperStatus(keeper: Address | undefined) {
  const { chainId } = useDeploymentTarget();
  const { fundingRateManager } = getContracts(chainId);

  return useReadContract({
    address: fundingRateManager,
    abi: FundingRateManagerABI,
    functionName: "keepers",
    args: keeper ? [keeper] : undefined,
    query: { enabled: !!keeper, refetchInterval: REFETCH_INTERVAL },
  });
}

export function useFundingAssetToken(assetId: `0x${string}` | undefined) {
  const { chainId } = useDeploymentTarget();
  const { fundingRateManager } = getContracts(chainId);

  return useReadContract({
    address: fundingRateManager,
    abi: FundingRateManagerABI,
    functionName: "assetTokens",
    args: assetId ? [assetId] : undefined,
    query: { enabled: !!assetId, refetchInterval: REFETCH_INTERVAL },
  });
}

export function useFundingConfig(assetId: `0x${string}` | undefined) {
  const { chainId } = useDeploymentTarget();
  const { fundingRateManager } = getContracts(chainId);

  return useReadContract({
    address: fundingRateManager,
    abi: FundingRateManagerABI,
    functionName: "fundingConfigs",
    args: assetId ? [assetId] : undefined,
    query: { enabled: !!assetId, refetchInterval: REFETCH_INTERVAL },
  });
}

export function useCalculatedFundingRateFactor(assetId: `0x${string}` | undefined) {
  const { chainId } = useDeploymentTarget();
  const { fundingRateManager } = getContracts(chainId);

  return useReadContract({
    address: fundingRateManager,
    abi: FundingRateManagerABI,
    functionName: "calculateFundingRateFactor",
    args: assetId ? [assetId] : undefined,
    query: { enabled: !!assetId, refetchInterval: REFETCH_INTERVAL },
  });
}

export function useSetFundingKeeper() {
  const { chainId } = useDeploymentTarget();
  const { fundingRateManager } = getContracts(chainId);
  const { writeContract, data: hash, ...rest } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  const setKeeper = (keeper: Address, active: boolean) => {
    writeContract({
      address: fundingRateManager,
      abi: FundingRateManagerABI,
      functionName: "setKeeper",
      args: [keeper, active],
    });
  };

  return { setKeeper, hash, receipt, ...rest };
}

export function useSetFundingInterval() {
  const { chainId } = useDeploymentTarget();
  const { fundingRateManager } = getContracts(chainId);
  const { writeContract, data: hash, ...rest } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  const setFundingInterval = (interval: bigint) => {
    writeContract({
      address: fundingRateManager,
      abi: FundingRateManagerABI,
      functionName: "setFundingInterval",
      args: [interval],
    });
  };

  return { setFundingInterval, hash, receipt, ...rest };
}

export function useSetDefaultFunding() {
  const { chainId } = useDeploymentTarget();
  const { fundingRateManager } = getContracts(chainId);
  const { writeContract, data: hash, ...rest } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  const setDefaultFunding = (baseFactor: bigint, maxFactor: bigint) => {
    writeContract({
      address: fundingRateManager,
      abi: FundingRateManagerABI,
      functionName: "setDefaultFunding",
      args: [baseFactor, maxFactor],
    });
  };

  return { setDefaultFunding, hash, receipt, ...rest };
}

export function useConfigureFunding() {
  const { chainId } = useDeploymentTarget();
  const { fundingRateManager } = getContracts(chainId);
  const { writeContract, data: hash, ...rest } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  const configureFunding = (
    assetId: `0x${string}`,
    baseFundingRateFactor: bigint,
    maxFundingRateFactor: bigint,
    imbalanceThresholdBps: bigint
  ) => {
    writeContract({
      address: fundingRateManager,
      abi: FundingRateManagerABI,
      functionName: "configureFunding",
      args: [assetId, baseFundingRateFactor, maxFundingRateFactor, imbalanceThresholdBps],
    });
  };

  return { configureFunding, hash, receipt, ...rest };
}

export function useMapFundingAssetToken() {
  const { chainId } = useDeploymentTarget();
  const { fundingRateManager } = getContracts(chainId);
  const { writeContract, data: hash, ...rest } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  const mapAssetToken = (assetId: `0x${string}`, token: Address) => {
    writeContract({
      address: fundingRateManager,
      abi: FundingRateManagerABI,
      functionName: "mapAssetToken",
      args: [assetId, token],
    });
  };

  return { mapAssetToken, hash, receipt, ...rest };
}

export function useTransferFundingOwnership() {
  const { chainId } = useDeploymentTarget();
  const { fundingRateManager } = getContracts(chainId);
  const { writeContract, data: hash, ...rest } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  const transferOwnership = (newOwner: Address) => {
    writeContract({
      address: fundingRateManager,
      abi: FundingRateManagerABI,
      functionName: "transferOwnership",
      args: [newOwner],
    });
  };

  return { transferOwnership, hash, receipt, ...rest };
}

export function useUpdateFundingRate() {
  const { chainId } = useDeploymentTarget();
  const { fundingRateManager } = getContracts(chainId);
  const { writeContract, data: hash, ...rest } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  const updateFundingRate = (newFundingRateFactor: bigint, newStableFundingRateFactor: bigint) => {
    writeContract({
      address: fundingRateManager,
      abi: FundingRateManagerABI,
      functionName: "updateFundingRate",
      args: [newFundingRateFactor, newStableFundingRateFactor],
    });
  };

  return { updateFundingRate, hash, receipt, ...rest };
}
