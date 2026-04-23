"use client";

import { useCallback, useState, useRef } from "react";
import { encodeFunctionData, type Abi, type Address } from "viem";
import {
  useWriteContract as useWagmiWriteContract,
  useWaitForTransactionReceipt,
  useChainId,
} from "wagmi";
import { isPrivyConfigured } from "@/config/privy";
import { sponsorshipStrategyForChainId } from "@/lib/sponsorship";
import { useSponsoredTransactionAdapter } from "./useSponsoredTransactionAdapter";

type WriteParams = {
  chainId?: number;
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};

export class SponsorshipError extends Error {
  public readonly originalError: Error;
  public readonly isGasRelated: boolean;

  constructor(message: string, originalError: Error, isGasRelated: boolean) {
    super(message);
    this.name = "SponsorshipError";
    this.originalError = originalError;
    this.isGasRelated = isGasRelated;
  }
}

function isSponsorshipFailure(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes("insufficient") ||
    message.includes("gas") ||
    message.includes("sponsor") ||
    message.includes("funds") ||
    message.includes("balance")
  );
}

function wrapSponsorshipError(error: Error): Error {
  if (isSponsorshipFailure(error)) {
    return new SponsorshipError(
      `Gas sponsorship failed: ${error.message}. ` +
        "Please verify your Privy sponsorship setup for this chain " +
        "(native sponsorship for Sepolia/Arbitrum Sepolia or 4337 smart wallet sponsorship for Fuji), " +
        "and confirm client-side transactions are allowed.",
      error,
      true
    );
  }
  return error;
}

/**
 * Drop-in replacement for wagmi's `useWriteContract` that sponsors gas
 * through Privy when an embedded wallet is active.
 *
 * Falls back to standard wagmi `useWriteContract` when Privy is not configured.
 */
export function useSponsoredWriteContract() {
  // Both flags are build-time constants so the branch is stable across renders.
  const isE2E = process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1";
  const useSponsored = isPrivyConfigured && !isE2E;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  if (useSponsored) return useSponsoredInner();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useWagmiWriteContract();
}

function useSponsoredInner() {
  const chainId = useChainId();
  const { embeddedWallet, sendSponsoredTx } = useSponsoredTransactionAdapter();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const isCallingRef = useRef(false);

  const isEmbeddedWallet = Boolean(embeddedWallet);

  const reset = useCallback(() => {
    setHash(undefined);
    setIsPending(false);
    setError(null);
  }, []);

  const writeContractAsync = useCallback(
    async (params: WriteParams): Promise<`0x${string}`> => {
      if (isCallingRef.current) throw new Error("Transaction already in progress");
      
      if (!isEmbeddedWallet) {
        throw new SponsorshipError(
          "Gas sponsorship requires a Privy embedded wallet. " +
            "You are currently using an external wallet (e.g. MetaMask). " +
            "Please log out and log back in with email or social login to use an embedded wallet.",
          new Error("External wallet detected"),
          true
        );
      }
      
      isCallingRef.current = true;
      setIsPending(true);
      setError(null);
      setHash(undefined);

      try {
        const txChainId = params.chainId ?? chainId;
        const data = encodeFunctionData({
          abi: params.abi as Abi,
          functionName: params.functionName,
          args: params.args as unknown[],
        });

        const receipt = await sendSponsoredTx({
          chainId: txChainId,
          to: params.address,
          data,
          ...(params.value != null ? { value: params.value } : {}),
        });

        const txHash = receipt.hash;
        setHash(txHash);
        return txHash;
      } catch (e) {
        const rawErr = e instanceof Error ? e : new Error(String(e));
        const txChainId = params.chainId ?? chainId;
        if (sponsorshipStrategyForChainId(txChainId) === "smart_wallet_4337") {
          rawErr.message = `Fuji smart-wallet sponsorship failed: ${rawErr.message}`;
        }
        const err = wrapSponsorshipError(rawErr);
        setError(err);
        throw err;
      } finally {
        setIsPending(false);
        isCallingRef.current = false;
      }
    },
    [chainId, isEmbeddedWallet, sendSponsoredTx]
  );

  const writeContract = useCallback(
    (params: WriteParams) => {
      writeContractAsync(params).catch(() => {});
    },
    [writeContractAsync]
  );

  return {
    writeContract,
    writeContractAsync,
    data: hash,
    isPending,
    error,
    isError: error !== null,
    reset,
  };
}

export { useWaitForTransactionReceipt };
