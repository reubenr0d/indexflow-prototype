"use client";

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { BasketFactoryABI } from "@/abi/contracts";
import { getContracts } from "@/config/contracts";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { REFETCH_INTERVAL } from "@/lib/constants";

export function useAllBaskets() {
  const { chainId } = useDeploymentTarget();
  const { basketFactory } = getContracts(chainId);

  return useReadContract({
    address: basketFactory,
    abi: BasketFactoryABI,
    functionName: "getAllBaskets",
    query: { refetchInterval: REFETCH_INTERVAL },
  });
}

export function useBasketCount() {
  const { chainId } = useDeploymentTarget();
  const { basketFactory } = getContracts(chainId);

  return useReadContract({
    address: basketFactory,
    abi: BasketFactoryABI,
    functionName: "getBasketCount",
    query: { refetchInterval: REFETCH_INTERVAL },
  });
}

export function useCreateBasket() {
  const { chainId } = useDeploymentTarget();
  const { basketFactory } = getContracts(chainId);
  const { writeContract, data: hash, ...rest } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  const createBasket = (
    name: string,
    depositFeeBps: bigint,
    redeemFeeBps: bigint
  ) => {
    writeContract({
      address: basketFactory,
      abi: BasketFactoryABI,
      functionName: "createBasket",
      args: [name, depositFeeBps, redeemFeeBps],
    });
  };

  return { createBasket, hash, receipt, ...rest };
}
