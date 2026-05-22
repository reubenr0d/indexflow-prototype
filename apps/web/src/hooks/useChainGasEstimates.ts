"use client";

import { useQuery } from "@tanstack/react-query";
import { useConfig } from "wagmi";
import { getPublicClient } from "@wagmi/core";
import { encodeFunctionData, formatUnits, type Abi, type Address } from "viem";
import { BasketVaultABI } from "@/abi/BasketVault";
import { ERC20ABI } from "@/abi/erc20";
import { getContracts } from "@/config/contracts";

export interface GasEstimateInput {
  chainId: number;
  vaultAddress: Address;
  amount: bigint;
  /** Required when computing the deposit estimate; falls back to the constant when absent. */
  account?: Address;
  /** When true, also estimates the ERC20 approve tx. */
  needsApproval: boolean;
}

export interface ChainGasEstimate {
  chainId: number;
  /** Gas units for the approve tx; 0n when approval is not needed. */
  approveGas: bigint;
  /** Gas units for the deposit tx (falls back to `FALLBACK_DEPOSIT_GAS` when estimation reverts). */
  depositGas: bigint;
  /** Live gas price in wei. */
  gasPrice: bigint;
  /** Total native-token wei cost = (approveGas + depositGas) * gasPrice. */
  nativeCostWei: bigint;
  /** Pretty `0.0001234 ETH` style string for display. */
  nativeCostFormatted: string;
  /** Native token symbol from the wagmi chain definition (e.g. "ETH", "AVAX"). */
  nativeSymbol: string;
  /** When true the deposit estimate fell back to a constant (no live estimate). */
  depositEstimateIsFallback: boolean;
}

const FALLBACK_DEPOSIT_GAS = 250_000n;
const FALLBACK_APPROVE_GAS = 60_000n;

function formatNativeWei(wei: bigint, decimals: number): string {
  const formatted = formatUnits(wei, decimals);
  const num = Number(formatted);
  if (!Number.isFinite(num)) return formatted;
  if (num === 0) return "0";
  if (num < 0.000001) return `<0.000001`;
  if (num < 1) return num.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return num.toFixed(4);
}

/**
 * Computes a live per-chain network-cost estimate for the planned
 * approve + deposit transactions. Used by the deposit confirm modal's
 * expandable "Details" panel to show how much network gas the user (or the
 * sponsor) would pay before confirming.
 *
 * - Approve gas is only fetched when `needsApproval` is true; otherwise 0.
 * - Deposit `estimateGas` will revert when the vault has not been approved
 *   yet (insufficient allowance), so we wrap it in try/catch and fall back to
 *   a conservative constant rather than failing the whole estimate. The flag
 *   `depositEstimateIsFallback` is surfaced so the UI can mark the value as
 *   approximate.
 * - Refreshes every 30s while mounted; callers can stop refreshing once
 *   execution starts by toggling the `enabled` flag.
 *
 * USD conversion is intentionally out of scope here — we only display native
 * token cost. A price feed can be layered on top by the caller later.
 */
export function useChainGasEstimates(
  inputs: GasEstimateInput[],
  options: { enabled?: boolean } = {}
) {
  const wagmiConfig = useConfig();
  const enabled = options.enabled !== false && inputs.length > 0;

  const key = inputs
    .map(
      (i) =>
        `${i.chainId}:${i.vaultAddress.toLowerCase()}:${i.amount.toString()}:${i.needsApproval ? 1 : 0}:${i.account?.toLowerCase() ?? ""}`
    )
    .sort()
    .join(",");

  return useQuery({
    queryKey: ["chain-gas-estimates", key],
    enabled,
    staleTime: 15_000,
    refetchInterval: enabled ? 30_000 : false,
    queryFn: async (): Promise<ChainGasEstimate[]> => {
      const results = await Promise.all(
        inputs.map(async (input): Promise<ChainGasEstimate> => {
          const chain = wagmiConfig.chains.find((c) => c.id === input.chainId);
          const nativeSymbol = chain?.nativeCurrency.symbol ?? "ETH";
          const nativeDecimals = chain?.nativeCurrency.decimals ?? 18;

          const empty: ChainGasEstimate = {
            chainId: input.chainId,
            approveGas: 0n,
            depositGas: FALLBACK_DEPOSIT_GAS,
            gasPrice: 0n,
            nativeCostWei: 0n,
            nativeCostFormatted: "—",
            nativeSymbol,
            depositEstimateIsFallback: true,
          };

          const publicClient = getPublicClient(wagmiConfig, { chainId: input.chainId });
          if (!publicClient) return empty;

          const { usdc } = getContracts(input.chainId);
          const approveData = encodeFunctionData({
            abi: ERC20ABI as Abi,
            functionName: "approve",
            args: [input.vaultAddress, input.amount],
          });
          const depositData = encodeFunctionData({
            abi: BasketVaultABI as Abi,
            functionName: "deposit",
            args: [input.amount],
          });

          let approveGas = 0n;
          if (input.needsApproval) {
            try {
              approveGas = await publicClient.estimateGas({
                account: input.account,
                to: usdc,
                data: approveData,
              });
            } catch (err) {
              console.warn(
                `[useChainGasEstimates] approve estimateGas failed on ${input.chainId}, using fallback:`,
                err instanceof Error ? err.message : err
              );
              approveGas = FALLBACK_APPROVE_GAS;
            }
          }

          let depositGas = FALLBACK_DEPOSIT_GAS;
          let depositEstimateIsFallback = true;
          try {
            depositGas = await publicClient.estimateGas({
              account: input.account,
              to: input.vaultAddress,
              data: depositData,
            });
            depositEstimateIsFallback = false;
          } catch {
            // Pre-approval the deposit call will revert with "ERC20: insufficient allowance",
            // which is expected. Fall back to a conservative constant so the UI still has a
            // number to display rather than zero.
          }

          let gasPrice = 0n;
          try {
            gasPrice = await publicClient.getGasPrice();
          } catch (err) {
            console.warn(
              `[useChainGasEstimates] getGasPrice failed on ${input.chainId}:`,
              err instanceof Error ? err.message : err
            );
          }

          const totalGas = approveGas + depositGas;
          const nativeCostWei = totalGas * gasPrice;
          const nativeCostFormatted =
            gasPrice > 0n ? `${formatNativeWei(nativeCostWei, nativeDecimals)} ${nativeSymbol}` : "—";

          return {
            chainId: input.chainId,
            approveGas,
            depositGas,
            gasPrice,
            nativeCostWei,
            nativeCostFormatted,
            nativeSymbol,
            depositEstimateIsFallback,
          };
        })
      );
      return results;
    },
  });
}
