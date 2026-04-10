"use client";

import { useCallback, useState, useRef } from "react";
import { encodeFunctionData, type Abi, type Address } from "viem";
import {
  useWriteContract as useWagmiWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useSendTransaction } from "@privy-io/react-auth";
import { isPrivyConfigured } from "@/config/privy";

type WriteParams = {
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};

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
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const isCallingRef = useRef(false);

  const reset = useCallback(() => {
    setHash(undefined);
    setIsPending(false);
    setError(null);
  }, []);

  const writeContractAsync = useCallback(
    async (params: WriteParams): Promise<`0x${string}`> => {
      if (isCallingRef.current) throw new Error("Transaction already in progress");
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
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        throw err;
      } finally {
        setIsPending(false);
        isCallingRef.current = false;
      }
    },
    [sendTransaction]
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
