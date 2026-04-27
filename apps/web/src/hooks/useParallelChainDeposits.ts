"use client";

import { useState, useCallback, useRef } from "react";
import { encodeFunctionData, type Address, type Abi } from "viem";
import { useAccount } from "wagmi";
import { isPrivyConfigured } from "@/config/privy";
import { getContracts } from "@/config/contracts";
import { BasketVaultABI } from "@/abi/BasketVault";
import { ERC20ABI } from "@/abi/erc20";
import { type ChainWeight } from "./useRoutingWeights";
import { CHAIN_REGISTRY, deploymentTargetForChainId } from "@/lib/deployment";
import { SponsorshipError } from "./useSponsoredWriteContract";
import { sponsorshipStrategyForChainId } from "@/lib/sponsorship";
import { useSponsoredTransactionAdapter } from "./useSponsoredTransactionAdapter";

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

const MIN_SPLIT_AMOUNT_USDC = 10_000_000n; // 10 USDC (6 decimals)
const CHAIN_TX_TIMEOUT_MS = 120_000; // 2 minutes per chain tx
const EXECUTION_TIMEOUT_MS = 150_000; // 2.5 minutes overall execution timeout

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
  if (totalWeight === 0 || activeWeights.length === 0 || totalAmount <= 0n) return [];

  const eligibleWeights = activeWeights
    .map((w) => ({ w, chainId: selectorToChainId(w.chainSelector) }))
    .filter((entry): entry is { w: ChainWeight; chainId: number } => entry.chainId !== null);
  if (eligibleWeights.length === 0) return [];

  // For tiny totals, route entirely to the highest-weight chain to avoid "shares too small" reverts.
  const minRequiredForSplit = MIN_SPLIT_AMOUNT_USDC * BigInt(eligibleWeights.length);
  if (totalAmount < minRequiredForSplit) {
    const top = eligibleWeights.reduce((best, current) =>
      current.w.weightBps > best.w.weightBps ? current : best
    );
    return [
      {
        chainId: top.chainId,
        chainSelector: top.w.chainSelector,
        chainName: top.w.chainName || chainIdToName(top.chainId),
        amount: totalAmount,
        percentage: 100,
      },
    ];
  }

  let bonusRemaining = totalAmount - minRequiredForSplit;
  const splits: {
    chainId: number;
    chainSelector: bigint;
    chainName: string;
    amount: bigint;
    percentage: number;
  }[] = [];

  for (let i = 0; i < eligibleWeights.length; i++) {
    const { w, chainId } = eligibleWeights[i];
    const isLast = i === eligibleWeights.length - 1;
    const bonus = isLast
      ? bonusRemaining
      : (bonusRemaining * BigInt(w.weightBps)) / BigInt(totalWeight);
    if (!isLast) bonusRemaining -= bonus;

    const amount = MIN_SPLIT_AMOUNT_USDC + bonus;
    const percentage = Number((amount * 10_000n) / totalAmount) / 100;

    if (amount > 0n) {
      splits.push({
        chainId,
        chainSelector: w.chainSelector,
        chainName: w.chainName || chainIdToName(chainId),
        amount,
        percentage,
      });
    }
  }

  return splits;
}

export function useParallelChainDeposits() {
  const isE2E = process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1";
  const useSponsored = isPrivyConfigured && !isE2E;
  
  const { address: connectedAddress } = useAccount();
  const { embeddedWallet, getSenderAddress, sendSponsoredTx } = useSponsoredTransactionAdapter();
  const isEmbeddedWallet = Boolean(embeddedWallet);

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
      console.log(`[ParallelDeposits] Chain ${chainId} status update:`, update.status ?? "no status change");
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
        
        if (signal.aborted) throw new Error("Aborted");

        const contracts = getContracts(chainId);
        const usdc = contracts.usdc;
        const senderAddress = await getSenderAddress(chainId);
        if (!senderAddress) {
          throw new SponsorshipError(
            `Unable to resolve sender address for chain ${chainId}.`,
            new Error("Missing chain sender"),
            true
          );
        }

        updateChainStatus(chainId, { status: "switching" });
        const depositData = encodeFunctionData({
          abi: BasketVaultABI as Abi,
          functionName: "deposit",
          args: [amount],
        });
        const approveData = encodeFunctionData({
          abi: ERC20ABI as Abi,
          functionName: "approve",
          args: [vaultAddress, amount],
        });
        const sendWithGuard = async <T>(
          actionLabel: "approval" | "deposit",
          action: () => Promise<T>
        ): Promise<T> =>
          new Promise<T>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
              cleanup();
              reject(
                new Error(
                  `Timed out waiting for ${chainIdToName(chainId)} ${actionLabel} confirmation after ${CHAIN_TX_TIMEOUT_MS / 1000}s. ` +
                    "Privy native sponsorship may be stalled or unresponsive."
                )
              );
            }, CHAIN_TX_TIMEOUT_MS);

            const onAbort = () => {
              cleanup();
              reject(new Error(`${actionLabel} aborted on ${chainIdToName(chainId)}.`));
            };

            const cleanup = () => {
              clearTimeout(timeoutId);
              signal.removeEventListener("abort", onAbort);
            };

            signal.addEventListener("abort", onAbort, { once: true });

            action()
              .then((result) => {
                cleanup();
                resolve(result);
              })
              .catch((error) => {
                cleanup();
                reject(error);
              });
          });

        const sendDeposit = async () => {
          updateChainStatus(chainId, { status: "depositing" });
          if (!useSponsored) {
            throw new Error("Non-Privy transactions not yet supported in parallel mode");
          }
          const receipt = await sendWithGuard("deposit", () =>
            sendSponsoredTx({
              chainId,
              to: vaultAddress,
              data: depositData,
              // Always request sponsorship for embedded-wallet flows.
              sponsor: true,
              // Keep wallet UI visible so the user can complete confirmations when needed.
              showWalletUIs: true,
            })
          );
          updateChainStatus(chainId, { depositTxHash: receipt.hash, status: "success" });
        };

        try {
          await sendDeposit();
        } catch (depositErr) {
          const depositMessage = depositErr instanceof Error ? depositErr.message.toLowerCase() : String(depositErr).toLowerCase();
          const needsApproval =
            depositMessage.includes("allowance") ||
            depositMessage.includes("approve") ||
            depositMessage.includes("insufficient allowance");
          if (!needsApproval) throw depositErr;

          if (signal.aborted) throw new Error("Aborted");
          updateChainStatus(chainId, { status: "approving" });
          if (!useSponsored) {
            throw new Error("Non-Privy transactions not yet supported in parallel mode");
          }
          const approveReceipt = await sendWithGuard("approval", () =>
            sendSponsoredTx({
              chainId,
              to: usdc,
              data: approveData,
              sponsor: true,
              showWalletUIs: true,
            })
          );
          updateChainStatus(chainId, { approveTxHash: approveReceipt.hash });

          if (signal.aborted) throw new Error("Aborted");
          await sendDeposit();
        }
      } catch (err) {
        if (signal.aborted) return;
        const rawMessage = err instanceof Error ? err.message : String(err);
        const strategy = sponsorshipStrategyForChainId(chainId);
        const lowerMessage = rawMessage.toLowerCase();
        
        const isSponsorshipFailure =
          lowerMessage.includes("insufficient") ||
          lowerMessage.includes("gas") ||
          lowerMessage.includes("sponsor") ||
          lowerMessage.includes("funds") ||
          lowerMessage.includes("balance") ||
          lowerMessage.includes("timed out");
        const isBalanceFailure =
          lowerMessage.includes("insufficient balance") ||
          lowerMessage.includes("transfer amount exceeds balance") ||
          lowerMessage.includes("erc20: transfer amount exceeds balance") ||
          lowerMessage.includes("insufficient funds");
        
        const message = isBalanceFailure
          ? `${chainIdToName(chainId)} deposit failed: insufficient balance. ${rawMessage}`
          : isSponsorshipFailure
            ? strategy === "smart_wallet_4337"
              ? `Fuji smart-wallet sponsorship failed: ${rawMessage}. Check Privy Smart Wallet + paymaster/bundler settings.`
              : `Gas sponsorship failed: ${rawMessage}. Check Privy Dashboard native sponsorship settings.`
            : rawMessage;
        
        updateChainStatus(chainId, { status: "error", error: message });
        
        if (isSponsorshipFailure && err instanceof Error) {
          throw new SponsorshipError(message, err, true);
        }
        throw err;
      }
    },
    [getSenderAddress, isEmbeddedWallet, sendSponsoredTx, updateChainStatus, useSponsored]
  );

  const execute = useCallback(
    async (
      splits: { chainId: number; chainSelector: bigint; chainName: string; amount: bigint; percentage: number }[],
      vaultMappings: ChainVaultMapping[]
    ) => {
      if ((!useSponsored && !connectedAddress) || splits.length === 0) return;

      console.log(`[ParallelDeposits] Starting execution for ${splits.length} chains`);

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

      let executionTimedOut = false;
      const executionTimeoutId = setTimeout(() => {
        console.warn("[ParallelDeposits] Overall execution timeout reached - aborting and marking incomplete chains as errored");
        executionTimedOut = true;
        controller.abort();
        setState((prev) => ({
          ...prev,
          isExecuting: false,
          hasErrors: true,
          chainStatuses: prev.chainStatuses.map((s) =>
            s.status !== "success" && s.status !== "error"
              ? { ...s, status: "error" as const, error: "Execution timed out waiting for transaction confirmation" }
              : s
          ),
        }));
      }, EXECUTION_TIMEOUT_MS);

      try {
        for (const split of splits) {
          if (executionTimedOut || controller.signal.aborted) {
            console.log(`[ParallelDeposits] Skipping chain ${split.chainId} - execution aborted`);
            break;
          }

          const vaultAddress = vaultMap.get(split.chainId);
          if (!vaultAddress) {
            updateChainStatus(split.chainId, {
              status: "error",
              error: "No vault address configured for this chain",
            });
            continue;
          }

          try {
            console.log(`[ParallelDeposits] Executing deposit on chain ${split.chainId} (${split.chainName})`);
            await executeChainDeposit(split, vaultAddress, controller.signal);
            console.log(`[ParallelDeposits] Deposit completed on chain ${split.chainId}`);
          } catch (err) {
            console.error(`[ParallelDeposits] Deposit failed on chain ${split.chainId}:`, err instanceof Error ? err.message : err);
          }
        }
      } finally {
        clearTimeout(executionTimeoutId);
        if (!executionTimedOut) {
          console.log("[ParallelDeposits] Execution loop completed, setting isExecuting=false");
          setState((prev) => ({ ...prev, isExecuting: false }));
        }
      }
    },
    [connectedAddress, executeChainDeposit, updateChainStatus, useSponsored]
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
    console.log("[ParallelDeposits] Manual abort triggered");
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
