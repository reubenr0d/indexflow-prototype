"use client";

import { useState } from "react";
import { useReadContract, useReadContracts, useSimulateContract, useWaitForTransactionReceipt } from "wagmi";
import { useSponsoredWriteContract } from "@/hooks/useSponsoredWriteContract";
import { BasketVaultABI } from "@/abi/BasketVault";
import { ERC20ABI } from "@/abi/erc20";
import { REFETCH_INTERVAL } from "@/lib/constants";
import { type Address } from "viem";
import { useTrackedTx, type TxKind } from "@/providers/TransactionStatusProvider";

export interface TxMeta {
  label: string;
  chainId?: number;
  kind?: TxKind;
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

export function useSimulateDeposit(vault: Address, amount: bigint, account: Address | undefined) {
  return useSimulateContract({
    address: vault,
    abi: BasketVaultABI,
    functionName: "deposit",
    args: [amount],
    account,
    query: { enabled: !!account && amount > 0n },
  });
}

export function useSimulateRedeem(vault: Address, shares: bigint, account: Address | undefined) {
  return useSimulateContract({
    address: vault,
    abi: BasketVaultABI,
    functionName: "redeem",
    args: [shares],
    account,
    query: { enabled: !!account && shares > 0n },
  });
}

export function useDeposit() {
  const { writeContract, data: hash, isPending, error, isError, ...rest } = useSponsoredWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  const [meta, setMeta] = useState<TxMeta | null>(null);
  useTrackedTx({
    hash,
    isPending,
    isError,
    error,
    receipt,
    kind: meta?.kind ?? "deposit",
    label: meta?.label ?? "Deposit",
    chainId: meta?.chainId,
  });

  const deposit = (vault: Address, amount: bigint, txMeta?: TxMeta) => {
    if (txMeta) setMeta(txMeta);
    writeContract({
      address: vault,
      abi: BasketVaultABI,
      functionName: "deposit",
      args: [amount],
    });
  };

  return { deposit, hash, isPending, error, isError, receipt, ...rest };
}

export function useRedeem() {
  const { writeContract, data: hash, isPending, error, isError, ...rest } = useSponsoredWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  const [meta, setMeta] = useState<TxMeta | null>(null);
  useTrackedTx({
    hash,
    isPending,
    isError,
    error,
    receipt,
    kind: meta?.kind ?? "redeem",
    label: meta?.label ?? "Redeem",
    chainId: meta?.chainId,
  });

  const redeem = (vault: Address, shares: bigint, txMeta?: TxMeta) => {
    if (txMeta) setMeta(txMeta);
    writeContract({
      address: vault,
      abi: BasketVaultABI,
      functionName: "redeem",
      args: [shares],
    });
  };

  return { redeem, hash, isPending, error, isError, receipt, ...rest };
}

export function useApproveUSDC() {
  const { writeContract, data: hash, isPending, error, isError, ...rest } = useSponsoredWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  const [meta, setMeta] = useState<TxMeta | null>(null);
  useTrackedTx({
    hash,
    isPending,
    isError,
    error,
    receipt,
    kind: meta?.kind ?? "approve",
    label: meta?.label ?? "Approve USDC",
    chainId: meta?.chainId,
  });

  const approve = (token: Address, spender: Address, amount: bigint, txMeta?: TxMeta) => {
    if (txMeta) setMeta(txMeta);
    writeContract({
      address: token,
      abi: ERC20ABI,
      functionName: "approve",
      args: [spender, amount],
    });
  };

  return { approve, hash, isPending, error, isError, receipt, ...rest };
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
  const { writeContract, data: hash, isPending, error, isError, ...rest } = useSponsoredWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  const [meta, setMeta] = useState<TxMeta | null>(null);
  useTrackedTx({
    hash,
    isPending,
    isError,
    error,
    receipt,
    kind: meta?.kind ?? "admin",
    label: meta?.label ?? "Set max perp allocation",
    chainId: meta?.chainId,
  });

  const setMaxPerpAllocation = (vault: Address, cap: bigint, txMeta?: TxMeta) => {
    if (txMeta) setMeta(txMeta);
    writeContract({
      address: vault,
      abi: BasketVaultABI,
      functionName: "setMaxPerpAllocation",
      args: [cap],
    });
  };

  return { setMaxPerpAllocation, hash, isPending, error, isError, receipt, ...rest };
}

export function useSetAssets() {
  const { writeContract, data: hash, isPending, error, isError, ...rest } = useSponsoredWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  const [meta, setMeta] = useState<TxMeta | null>(null);
  useTrackedTx({
    hash,
    isPending,
    isError,
    error,
    receipt,
    kind: meta?.kind ?? "admin",
    label: meta?.label ?? "Update basket assets",
    chainId: meta?.chainId,
  });

  const setAssets = (vault: Address, assetIds: `0x${string}`[], txMeta?: TxMeta) => {
    if (txMeta) setMeta(txMeta);
    writeContract({
      address: vault,
      abi: BasketVaultABI,
      functionName: "setAssets",
      args: [assetIds],
    });
  };

  return { setAssets, hash, isPending, error, isError, receipt, ...rest };
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

export function useAvailableForPerpBatch(vaults: Address[]) {
  return useReadContracts({
    contracts: vaults.map((vault) => ({
      address: vault,
      abi: BasketVaultABI,
      functionName: "getAvailableForPerpUsdc" as const,
    })),
    query: { enabled: vaults.length > 0, refetchInterval: REFETCH_INTERVAL },
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
  const { writeContract, data: hash, isPending, error, isError, ...rest } = useSponsoredWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  const [meta, setMeta] = useState<TxMeta | null>(null);
  useTrackedTx({
    hash,
    isPending,
    isError,
    error,
    receipt,
    kind: meta?.kind ?? "admin",
    label: meta?.label ?? "Set min reserve",
    chainId: meta?.chainId,
  });

  const setMinReserveBps = (vault: Address, bps: bigint, txMeta?: TxMeta) => {
    if (txMeta) setMeta(txMeta);
    writeContract({
      address: vault,
      abi: BasketVaultABI,
      functionName: "setMinReserveBps",
      args: [bps],
    });
  };

  return { setMinReserveBps, hash, isPending, error, isError, receipt, ...rest };
}

export function useTopUpReserve() {
  const { writeContract, data: hash, isPending, error, isError, ...rest } = useSponsoredWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  const [meta, setMeta] = useState<TxMeta | null>(null);
  useTrackedTx({
    hash,
    isPending,
    isError,
    error,
    receipt,
    kind: meta?.kind ?? "admin",
    label: meta?.label ?? "Top up reserve",
    chainId: meta?.chainId,
  });

  const topUpReserve = (vault: Address, amount: bigint, txMeta?: TxMeta) => {
    if (txMeta) setMeta(txMeta);
    writeContract({
      address: vault,
      abi: BasketVaultABI,
      functionName: "topUpReserve",
      args: [amount],
    });
  };

  return { topUpReserve, hash, isPending, error, isError, receipt, ...rest };
}
