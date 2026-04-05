"use client";

import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { BasketVaultABI } from "@/abi/contracts";
import { ERC20ABI } from "@/abi/erc20";
import { REFETCH_INTERVAL } from "@/lib/constants";
import { type Address } from "viem";

export function useBasketPrice(vault: Address) {
  return useReadContract({
    address: vault,
    abi: BasketVaultABI,
    functionName: "getBasketPrice",
    query: { refetchInterval: REFETCH_INTERVAL },
  });
}

export function useSharePrice(vault: Address) {
  return useReadContract({
    address: vault,
    abi: BasketVaultABI,
    functionName: "getSharePrice",
    query: { refetchInterval: REFETCH_INTERVAL },
  });
}

export function useBasketAssets(vault: Address) {
  const { data: count } = useReadContract({
    address: vault,
    abi: BasketVaultABI,
    functionName: "getAssetCount",
  });

  const assetCount = count ? Number(count) : 0;
  const indices = Array.from({ length: assetCount }, (_, i) => i);

  return useReadContracts({
    contracts: indices.map((i) => ({
      address: vault,
      abi: BasketVaultABI,
      functionName: "getAssetAt" as const,
      args: [BigInt(i)] as const,
    })),
    query: { enabled: assetCount > 0, refetchInterval: REFETCH_INTERVAL },
  });
}

export function useBasketName(vault: Address) {
  return useReadContract({
    address: vault,
    abi: BasketVaultABI,
    functionName: "name",
  });
}

export function useBasketFees(vault: Address) {
  const deposit = useReadContract({
    address: vault,
    abi: BasketVaultABI,
    functionName: "depositFeeBps",
  });
  const redeem = useReadContract({
    address: vault,
    abi: BasketVaultABI,
    functionName: "redeemFeeBps",
  });
  return { depositFee: deposit.data, redeemFee: redeem.data };
}

export function useDeposit() {
  const { writeContract, data: hash, ...rest } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  const deposit = (vault: Address, amount: bigint) => {
    writeContract({
      address: vault,
      abi: BasketVaultABI,
      functionName: "deposit",
      args: [amount],
    });
  };

  return { deposit, hash, receipt, ...rest };
}

export function useRedeem() {
  const { writeContract, data: hash, ...rest } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  const redeem = (vault: Address, shares: bigint) => {
    writeContract({
      address: vault,
      abi: BasketVaultABI,
      functionName: "redeem",
      args: [shares],
    });
  };

  return { redeem, hash, receipt, ...rest };
}

export function useApproveUSDC() {
  const { writeContract, data: hash, ...rest } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  const approve = (token: Address, spender: Address, amount: bigint) => {
    writeContract({
      address: token,
      abi: ERC20ABI,
      functionName: "approve",
      args: [spender, amount],
    });
  };

  return { approve, hash, receipt, ...rest };
}

export function useUSDCBalance(token: Address, account: Address | undefined) {
  return useReadContract({
    address: token,
    abi: ERC20ABI,
    functionName: "balanceOf",
    args: account ? [account] : undefined,
    query: { enabled: !!account, refetchInterval: REFETCH_INTERVAL },
  });
}

export function useUSDCAllowance(token: Address, owner: Address | undefined, spender: Address) {
  return useReadContract({
    address: token,
    abi: ERC20ABI,
    functionName: "allowance",
    args: owner ? [owner, spender] : undefined,
    query: { enabled: !!owner, refetchInterval: REFETCH_INTERVAL },
  });
}

export function useMaxPerpAllocation(vault: Address) {
  return useReadContract({
    address: vault,
    abi: BasketVaultABI,
    functionName: "maxPerpAllocation",
    query: { refetchInterval: REFETCH_INTERVAL },
  });
}

export function useSetMaxPerpAllocation() {
  const { writeContract, data: hash, ...rest } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  const setMaxPerpAllocation = (vault: Address, cap: bigint) => {
    writeContract({
      address: vault,
      abi: BasketVaultABI,
      functionName: "setMaxPerpAllocation",
      args: [cap],
    });
  };

  return { setMaxPerpAllocation, hash, receipt, ...rest };
}

export function useMinReserveBps(vault: Address) {
  return useReadContract({
    address: vault,
    abi: BasketVaultABI,
    functionName: "minReserveBps",
    query: { refetchInterval: REFETCH_INTERVAL },
  });
}

export function useRequiredReserveUsdc(vault: Address) {
  return useReadContract({
    address: vault,
    abi: BasketVaultABI,
    functionName: "getRequiredReserveUsdc",
    query: { refetchInterval: REFETCH_INTERVAL },
  });
}

export function useAvailableForPerpUsdc(vault: Address) {
  return useReadContract({
    address: vault,
    abi: BasketVaultABI,
    functionName: "getAvailableForPerpUsdc",
    query: { refetchInterval: REFETCH_INTERVAL },
  });
}

export function useCollectedFees(vault: Address) {
  return useReadContract({
    address: vault,
    abi: BasketVaultABI,
    functionName: "collectedFees",
    query: { refetchInterval: REFETCH_INTERVAL },
  });
}

export function useSetMinReserveBps() {
  const { writeContract, data: hash, ...rest } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  const setMinReserveBps = (vault: Address, bps: bigint) => {
    writeContract({
      address: vault,
      abi: BasketVaultABI,
      functionName: "setMinReserveBps",
      args: [bps],
    });
  };

  return { setMinReserveBps, hash, receipt, ...rest };
}

export function useTopUpReserve() {
  const { writeContract, data: hash, ...rest } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  const topUpReserve = (vault: Address, amount: bigint) => {
    writeContract({
      address: vault,
      abi: BasketVaultABI,
      functionName: "topUpReserve",
      args: [amount],
    });
  };

  return { topUpReserve, hash, receipt, ...rest };
}
