"use client";

import { useState, useCallback, useRef } from "react";
import { encodeFunctionData, type Address, type Abi } from "viem";
import { useAccount, useSwitchChain, usePublicClient } from "wagmi";
import { useSendTransaction, useWallets } from "@privy-io/react-auth";
import { isPrivyConfigured } from "@/config/privy";
import { getContracts } from "@/config/contracts";
import { BasketVaultABI } from "@/abi/BasketVault";
import { ERC20ABI } from "@/abi/erc20";
import { type ChainWeight } from "./useRoutingWeights";
import { CHAIN_REGISTRY, deploymentTargetForChainId } from "@/lib/deployment";
import { SponsorshipError } from "./useSponsoredWriteContract";

export type ChainTxStatus = "idle" | "switching" | "approving" | "depositing" | "success" | "error";

export interface ChainDepositStatus {
  chainName: string;
  chainId: number;
  chainSelector: bigint;
  amount: bigint;
  percentage: number;
  status: ChainTxStatus;
  approveTxHash?: `0x${string}`;
  depositTxHash?: `0x${string}`;
  error?: string;
}

export interface ParallelDepositsState {
  isExecuting: boolean;
  chainStatuses: ChainDepositStatus[];
  completedCount: number;
  totalCount: number;
  hasErrors: boolean;
}

interface ChainVaultMapping {
  chainId: number;
  vaultAddress: Address;
}

function selectorToChainId(selector: bigint): number | null {
  for (const [, cfg] of Object.entries(CHAIN_REGISTRY)) {
    if (cfg.ccipChainSelector === selector.toString()) {
      return cfg.chainId;
    }
  }
  return null;
}

function chainIdToName(chainId: number): string {
  const target = deploymentTargetForChainId(chainId);
  if (!target) return `Chain ${chainId}`;
  return CHAIN_REGISTRY[target]?.rpcAlias ?? target;
}

export function computeDepositSplits(
  totalAmount: bigint,
  weights: ChainWeight[]
): { chainId: number; chainSelector: bigint; chainName: string; amount: bigint; percentage: number }[] {
  const activeWeights = weights.filter((w) => w.weightBps > 0);
  const totalWeight = activeWeights.reduce((s, w) => s + w.weightBps, 0);
  if (totalWeight === 0 || activeWeights.length === 0) return [];

  let remaining = totalAmount;
  const splits: {
    chainId: number;
    chainSelector: bigint;
    chainName: string;
    amount: bigint;
    percentage: number;
  }[] = [];

  for (let i = 0; i < activeWeights.length; i++) {
    const w = activeWeights[i];
    const isLast = i === activeWeights.length - 1;
    const chainId = selectorToChainId(w.chainSelector);
    
    if (!chainId) continue;

    const amount = isLast
      ? remaining
      : (totalAmount * BigInt(w.weightBps)) / BigInt(totalWeight);
    
    if (!isLast) remaining -= amount;

    if (amount > 0n) {
      splits.push({
        chainId,
        chainSelector: w.chainSelector,
        chainName: w.chainName || chainIdToName(chainId),
        amount,
        percentage: (w.weightBps / totalWeight) * 100,
      });
    }
  }

  return splits;
}

export function useParallelChainDeposits() {
  const isE2E = process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1";
  const useSponsored = isPrivyConfigured && !isE2E;
  
  const { address } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient();
  const { sendTransaction } = useSendTransaction();
  const { wallets } = useWallets();
  
  const activeWallet = wallets.find((w) => w.walletClientType === "privy");
  const isEmbeddedWallet = Boolean(activeWallet);

  const [state, setState] = useState<ParallelDepositsState>({
    isExecuting: false,
    chainStatuses: [],
    completedCount: 0,
    totalCount: 0,
    hasErrors: false,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const updateChainStatus = useCallback(
    (chainId: number, update: Partial<ChainDepositStatus>) => {
      setState((prev) => {
        const newStatuses = prev.chainStatuses.map((s) =>
          s.chainId === chainId ? { ...s, ...update } : s
        );
        const completedCount = newStatuses.filter(
          (s) => s.status === "success" || s.status === "error"
        ).length;
        const hasErrors = newStatuses.some((s) => s.status === "error");
        
        return {
          ...prev,
          chainStatuses: newStatuses,
          completedCount,
          hasErrors,
        };
      });
    },
    []
  );

  const executeChainDeposit = useCallback(
    async (
      split: { chainId: number; chainSelector: bigint; chainName: string; amount: bigint; percentage: number },
      vaultAddress: Address,
      signal: AbortSignal
    ): Promise<void> => {
      const { chainId, amount } = split;

      if (signal.aborted) {
        throw new Error("Aborted");
      }

      try {
        if (useSponsored && !isEmbeddedWallet) {
          throw new SponsorshipError(
            "Gas sponsorship requires a Privy embedded wallet. " +
              "You are using an external wallet. Log in with email/social to use an embedded wallet.",
            new Error("External wallet detected"),
            true
          );
        }
        
        updateChainStatus(chainId, { status: "switching" });
        await switchChainAsync({ chainId });

        if (signal.aborted) throw new Error("Aborted");

        const contracts = getContracts(chainId);
        const usdc = contracts.usdc;

        const allowance = await publicClient?.readContract({
          address: usdc,
          abi: ERC20ABI,
          functionName: "allowance",
          args: [address!, vaultAddress],
        }) as bigint;

        if (signal.aborted) throw new Error("Aborted");

        if (allowance < amount) {
          updateChainStatus(chainId, { status: "approving" });

          const approveData = encodeFunctionData({
            abi: ERC20ABI as Abi,
            functionName: "approve",
            args: [vaultAddress, amount],
          });

          if (useSponsored) {
            const receipt = await sendTransaction(
              { to: usdc, data: approveData },
              { sponsor: true, uiOptions: { showWalletUIs: false } }
            );
            updateChainStatus(chainId, { approveTxHash: receipt.hash });
          } else {
            throw new Error("Non-Privy transactions not yet supported in parallel mode");
          }
        }

        if (signal.aborted) throw new Error("Aborted");

        updateChainStatus(chainId, { status: "depositing" });

        const depositData = encodeFunctionData({
          abi: BasketVaultABI as Abi,
          functionName: "deposit",
          args: [amount],
        });

        if (useSponsored) {
          const receipt = await sendTransaction(
            { to: vaultAddress, data: depositData },
            { sponsor: true, uiOptions: { showWalletUIs: false } }
          );
          updateChainStatus(chainId, { 
            depositTxHash: receipt.hash,
            status: "success" 
          });
        } else {
          throw new Error("Non-Privy transactions not yet supported in parallel mode");
        }
      } catch (err) {
        if (signal.aborted) return;
        const rawMessage = err instanceof Error ? err.message : String(err);
        const lowerMessage = rawMessage.toLowerCase();
        
        const isSponsorshipFailure =
          lowerMessage.includes("insufficient") ||
          lowerMessage.includes("gas") ||
          lowerMessage.includes("sponsor") ||
          lowerMessage.includes("funds") ||
          lowerMessage.includes("balance");
        
        const message = isSponsorshipFailure
          ? `Gas sponsorship failed: ${rawMessage}. Check Privy Dashboard settings.`
          : rawMessage;
        
        updateChainStatus(chainId, { status: "error", error: message });
        
        if (isSponsorshipFailure && err instanceof Error) {
          throw new SponsorshipError(message, err, true);
        }
        throw err;
      }
    },
    [address, isEmbeddedWallet, publicClient, sendTransaction, switchChainAsync, updateChainStatus, useSponsored]
  );

  const execute = useCallback(
    async (
      splits: { chainId: number; chainSelector: bigint; chainName: string; amount: bigint; percentage: number }[],
      vaultMappings: ChainVaultMapping[]
    ) => {
      if (!address || splits.length === 0) return;

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const vaultMap = new Map(vaultMappings.map((m) => [m.chainId, m.vaultAddress]));

      const initialStatuses: ChainDepositStatus[] = splits.map((split) => ({
        chainName: split.chainName,
        chainId: split.chainId,
        chainSelector: split.chainSelector,
        amount: split.amount,
        percentage: split.percentage,
        status: "idle" as const,
      }));

      setState({
        isExecuting: true,
        chainStatuses: initialStatuses,
        completedCount: 0,
        totalCount: splits.length,
        hasErrors: false,
      });

      const promises = splits.map(async (split) => {
        const vaultAddress = vaultMap.get(split.chainId);
        if (!vaultAddress) {
          updateChainStatus(split.chainId, {
            status: "error",
            error: "No vault address configured for this chain",
          });
          return;
        }

        try {
          await executeChainDeposit(split, vaultAddress, controller.signal);
        } catch {
          // Error already handled in executeChainDeposit
        }
      });

      await Promise.allSettled(promises);

      setState((prev) => ({ ...prev, isExecuting: false }));
    },
    [address, executeChainDeposit, updateChainStatus]
  );

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    setState({
      isExecuting: false,
      chainStatuses: [],
      completedCount: 0,
      totalCount: 0,
      hasErrors: false,
    });
  }, []);

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    setState((prev) => ({ ...prev, isExecuting: false }));
  }, []);

  return {
    state,
    execute,
    reset,
    abort,
    computeDepositSplits,
  };
}
