"use client";

import { useCallback, useState, useRef } from "react";
import { encodeFunctionData, type Abi, type Address } from "viem";
import {
  useWriteContract as useWagmiWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useSendTransaction, useWallets } from "@privy-io/react-auth";
import { isPrivyConfigured } from "@/config/privy";

type WriteParams = {
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
        "Please verify that gas sponsorship is enabled in the Privy Dashboard, " +
        "the correct chains are configured, and client-side transactions are allowed.",
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
  const { sendTransaction } = useSendTransaction();
  const { wallets } = useWallets();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const isCallingRef = useRef(false);

  const activeWallet = wallets.find((w) => w.walletClientType === "privy");
  const isEmbeddedWallet = Boolean(activeWallet);

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
        const data = encodeFunctionData({
          abi: params.abi as Abi,
          functionName: params.functionName,
          args: params.args as unknown[],
        });

        const receipt = await sendTransaction(
          {
            to: params.address,
            data,
            ...(params.value != null ? { value: params.value } : {}),
          },
          { sponsor: true }
        );

        const txHash = receipt.hash;
        setHash(txHash);
        return txHash;
      } catch (e) {
        const rawErr = e instanceof Error ? e : new Error(String(e));
        const err = wrapSponsorshipError(rawErr);
        setError(err);
        throw err;
      } finally {
        setIsPending(false);
        isCallingRef.current = false;
      }
    },
    [sendTransaction, isEmbeddedWallet]
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
