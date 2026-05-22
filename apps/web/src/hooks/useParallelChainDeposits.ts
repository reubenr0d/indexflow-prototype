"use client";

import { useState, useCallback, useRef } from "react";
import { encodeFunctionData, type Address, type Abi } from "viem";
import { useAccount, useConfig, useSwitchChain } from "wagmi";
import { getWalletClient, getPublicClient } from "@wagmi/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

export interface DepositSplit {
  chainId: number;
  chainSelector: bigint;
  chainName: string;
  amount: bigint;
  percentage: number;
}

const MIN_SPLIT_AMOUNT_USDC = 10_000_000n; // 10 USDC (6 decimals)
const CHAIN_TX_TIMEOUT_MS = 120_000; // 2 minutes per chain tx
const EXECUTION_TIMEOUT_MS = 150_000; // 2.5 minutes overall execution timeout
const RECEIPT_TIMEOUT_MS = 120_000; // wait-for-receipt window per non-sponsored tx

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
): DepositSplit[] {
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
  const splits: DepositSplit[] = [];

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

interface AllowanceQueryInput {
  chainId: number;
  vaultAddress: Address;
}

/**
 * Fetches the current USDC -> vault allowance on every chain in the input set
 * for the given owner. Used by the deposit modal preview to compute
 * `needsApprovalPerChain` before the user clicks confirm — so the UI can show
 * "Approve" steps up front instead of discovering allowance shortfalls by
 * letting `deposit` revert on-chain.
 */
export function useAllowancesPerChain(
  owner: Address | undefined,
  inputs: AllowanceQueryInput[]
) {
  const wagmiConfig = useConfig();

  const key = inputs
    .map((i) => `${i.chainId}:${i.vaultAddress.toLowerCase()}`)
    .sort()
    .join(",");

  return useQuery({
    queryKey: ["allowances-per-chain", owner?.toLowerCase() ?? "", key],
    enabled: Boolean(owner) && inputs.length > 0,
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Record<number, bigint>> => {
      if (!owner) return {};
      const entries = await Promise.all(
        inputs.map(async (input) => {
          try {
            const client = getPublicClient(wagmiConfig, { chainId: input.chainId });
            if (!client) return [input.chainId, 0n] as const;
            const { usdc } = getContracts(input.chainId);
            const allowance = (await client.readContract({
              address: usdc,
              abi: ERC20ABI,
              functionName: "allowance",
              args: [owner, input.vaultAddress],
            })) as bigint;
            return [input.chainId, allowance] as const;
          } catch (err) {
            console.warn(
              `[useAllowancesPerChain] Failed to read allowance on chain ${input.chainId}:`,
              err instanceof Error ? err.message : err
            );
            return [input.chainId, 0n] as const;
          }
        })
      );
      return Object.fromEntries(entries) as Record<number, bigint>;
    },
  });
}

/**
 * Given current per-chain allowances and the planned per-chain deposit amounts,
 * returns a mapping of chainId -> whether an approval is required before the
 * deposit can succeed. Pure helper; kept exported so the modal preview and the
 * execution hook share the exact same logic.
 */
export function computeNeedsApprovalPerChain(
  splits: DepositSplit[],
  allowances: Record<number, bigint>
): Record<number, boolean> {
  return Object.fromEntries(
    splits.map((s) => [s.chainId, (allowances[s.chainId] ?? 0n) < s.amount])
  );
}

interface ExecuteOptions {
  /** Per-chain approval requirements computed up-front by the caller. */
  needsApprovalPerChain?: Record<number, boolean>;
}

export function useParallelChainDeposits() {
  const isE2E = process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1";
  const useSponsored = isPrivyConfigured && !isE2E;

  const { address: connectedAddress } = useAccount();
  const { embeddedWallet, getSenderAddress, sendSponsoredTx } = useSponsoredTransactionAdapter();
  const isEmbeddedWallet = Boolean(embeddedWallet);
  const wagmiConfig = useConfig();
  const queryClient = useQueryClient();
  const { switchChainAsync } = useSwitchChain();

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

  /**
   * Invalidates wagmi/react-query caches that track USDC allowance and the
   * deposit simulation on `chainId`. Called after a successful deposit so the
   * panel button and any other consumers immediately reflect that the
   * approval was consumed (rather than waiting for the next refetch tick).
   */
  const invalidateAllowanceCache = useCallback(
    (chainId: number, vaultAddress: Address) => {
      const usdcAddress = getContracts(chainId).usdc.toLowerCase();
      const vaultLower = vaultAddress.toLowerCase();

      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          if (!Array.isArray(key) || key.length === 0) return false;
          const head = key[0];

          // Pre-flight allowance hook used by this module.
          if (head === "allowances-per-chain") return true;

          // wagmi's readContract / simulateContract caches embed { address, args, chainId, ...}
          // in the second key element. Invalidate any matching ERC20.allowance(...)
          // and any vault.deposit simulation read so the UI refreshes.
          if (head === "readContract" || head === "simulateContract") {
            const params = key[1] as
              | { address?: string; args?: readonly unknown[]; chainId?: number }
              | undefined;
            if (!params) return false;
            if (params.chainId !== undefined && params.chainId !== chainId) return false;

            const addr = params.address?.toLowerCase();
            const args = params.args ?? [];
            if (addr === usdcAddress) {
              const spender = args[1];
              if (typeof spender === "string" && spender.toLowerCase() === vaultLower) {
                return true;
              }
            }
            if (addr === vaultLower) return true;
          }
          return false;
        },
      });
    },
    [queryClient]
  );

  type SendTxFn = (params: {
    chainId: number;
    to: Address;
    data: `0x${string}`;
  }) => Promise<{ hash: `0x${string}` }>;

  /**
   * Returns the right per-chain tx sender for the active environment.
   * - Sponsored (Privy embedded): hands off to `sendSponsoredTx` so gas is paid by Privy's paymaster.
   * - External wallet (no Privy / E2E): switches the wallet to the target chain, then writes via the
   *   user's connector wallet client. Waits for the receipt before resolving so the orchestrator can
   *   sequence approve -> deposit without races.
   */
  const buildSendTx = useCallback((): SendTxFn => {
    if (useSponsored) {
      return (params) => sendSponsoredTx({ ...params, sponsor: true });
    }
    return async ({ chainId, to, data }) => {
      if (!connectedAddress) {
        throw new Error("No connected wallet available for non-sponsored deposit");
      }
      try {
        await switchChainAsync({ chainId });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Failed to switch wallet to ${chainIdToName(chainId)}: ${message}. Approve the chain switch in your wallet and try again.`
        );
      }
      const walletClient = await getWalletClient(wagmiConfig, { chainId });
      if (!walletClient) {
        throw new Error(`No wallet client available for chain ${chainId}`);
      }
      const hash = await walletClient.sendTransaction({
        account: connectedAddress,
        to,
        data,
        chain: walletClient.chain,
      });
      const publicClient = getPublicClient(wagmiConfig, { chainId });
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS });
      }
      return { hash };
    };
  }, [connectedAddress, sendSponsoredTx, switchChainAsync, useSponsored, wagmiConfig]);

  const executeChainDeposit = useCallback(
    async (
      split: DepositSplit,
      vaultAddress: Address,
      needsApproval: boolean,
      sendTx: SendTxFn,
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

        if (useSponsored) {
          const senderAddress = await getSenderAddress(chainId);
          if (!senderAddress) {
            throw new SponsorshipError(
              `Unable to resolve sender address for chain ${chainId}.`,
              new Error("Missing chain sender"),
              true
            );
          }
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
                    "The relayer or wallet may be stalled or unresponsive."
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

        if (needsApproval) {
          updateChainStatus(chainId, { status: "approving" });
          const approveReceipt = await sendWithGuard("approval", () =>
            sendTx({ chainId, to: usdc, data: approveData })
          );
          updateChainStatus(chainId, { approveTxHash: approveReceipt.hash });
          if (signal.aborted) throw new Error("Aborted");
        }

        updateChainStatus(chainId, { status: "depositing" });
        const depositReceipt = await sendWithGuard("deposit", () =>
          sendTx({ chainId, to: vaultAddress, data: depositData })
        );
        updateChainStatus(chainId, { depositTxHash: depositReceipt.hash, status: "success" });

        // Approval is consumed by the deposit, so refresh any cached allowance reads
        // so the panel button and other surfaces immediately reflect the new state.
        invalidateAllowanceCache(chainId, vaultAddress);
      } catch (err) {
        if (signal.aborted) return;
        const rawMessage = err instanceof Error ? err.message : String(err);
        const strategy = sponsorshipStrategyForChainId(chainId);
        const lowerMessage = rawMessage.toLowerCase();

        const isSponsorshipFailure =
          useSponsored &&
          (lowerMessage.includes("insufficient") ||
            lowerMessage.includes("gas") ||
            lowerMessage.includes("sponsor") ||
            lowerMessage.includes("funds") ||
            lowerMessage.includes("balance") ||
            lowerMessage.includes("timed out"));
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
    [getSenderAddress, invalidateAllowanceCache, isEmbeddedWallet, updateChainStatus, useSponsored]
  );

  const execute = useCallback(
    async (
      splits: DepositSplit[],
      vaultMappings: ChainVaultMapping[],
      options: ExecuteOptions = {}
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

      const sendTx = buildSendTx();

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

          // If the caller didn't provide an explicit pre-flight result, fall back
          // to "needs approval" so we always at least try to approve. The execute
          // path then short-circuits without sending the approve tx if the
          // allowance is already sufficient (we re-read it just before approving).
          const needsApproval = options.needsApprovalPerChain?.[split.chainId] ?? true;

          try {
            console.log(
              `[ParallelDeposits] Executing deposit on chain ${split.chainId} (${split.chainName}) needsApproval=${needsApproval}`
            );
            await executeChainDeposit(split, vaultAddress, needsApproval, sendTx, controller.signal);
            console.log(`[ParallelDeposits] Deposit completed on chain ${split.chainId}`);
          } catch (err) {
            console.error(
              `[ParallelDeposits] Deposit failed on chain ${split.chainId}:`,
              err instanceof Error ? err.message : err
            );
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
    [buildSendTx, connectedAddress, executeChainDeposit, updateChainStatus, useSponsored]
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
