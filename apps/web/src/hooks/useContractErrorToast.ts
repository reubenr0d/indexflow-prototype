"use client";

import { useEffect, useRef } from "react";
import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
  decodeErrorResult,
  type Hex,
} from "viem";
import { showToast, dismissPending } from "@/components/ui/toast";
import { ALL_ERRORS_ABI } from "@/abi/all-errors";

function formatCustomError(errorName: string, args: readonly unknown[] | undefined) {
  if (!args || args.length === 0) return errorName;
  const formattedArgs = args.map((arg) => String(arg)).join(", ");
  return `${errorName}(${formattedArgs})`;
}

function extractRevertData(error: BaseError): Hex | undefined {
  let hex: Hex | undefined;
  error.walk((inner) => {
    const d = (inner as { data?: unknown }).data;
    if (typeof d === "string" && /^0x[0-9a-f]+$/i.test(d) && d.length >= 10) {
      hex = d as Hex;
    }
    return false;
  });
  return hex;
}

function tryDecodeWithCombinedAbi(data: Hex): string | undefined {
  try {
    const decoded = decodeErrorResult({ abi: ALL_ERRORS_ABI, data });
    return formatCustomError(
      decoded.errorName,
      decoded.args as readonly unknown[] | undefined
    );
  } catch {
    return undefined;
  }
}

/**
 * Returns a human-readable error string, or `null` if the error should be
 * silently dismissed (e.g. user rejected the tx in their wallet).
 */
export function getContractErrorMessage(
  error: unknown,
  fallbackMessage: string
): string | null {
  if (!error) return fallbackMessage;

  if (error instanceof BaseError) {
    const rejection = error.walk(
      (e) => e instanceof UserRejectedRequestError
    );
    if (rejection) return null;

    const revertError = error.walk(
      (innerError) => innerError instanceof ContractFunctionRevertedError
    );

    if (revertError instanceof ContractFunctionRevertedError) {
      if (revertError.reason) return revertError.reason;
      if (revertError.data?.errorName) {
        return formatCustomError(
          revertError.data.errorName,
          revertError.data.args as readonly unknown[] | undefined
        );
      }
    }

    const rawData = extractRevertData(error);
    if (rawData) {
      const decoded = tryDecodeWithCombinedAbi(rawData);
      if (decoded) return decoded;
    }

    if (revertError instanceof ContractFunctionRevertedError) {
      if (revertError.shortMessage) return revertError.shortMessage;
    }

    if (error.shortMessage) return error.shortMessage;
    if (error.message) return error.message;
  }

  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  return fallbackMessage;
}

type UseContractErrorToastParams = {
  writeError?: unknown;
  writeIsError?: boolean;
  receiptError?: unknown;
  receiptIsError?: boolean;
  fallbackMessage: string;
};

export function useContractErrorToast({
  writeError,
  writeIsError = false,
  receiptError,
  receiptIsError = false,
  fallbackMessage,
}: UseContractErrorToastParams) {
  const lastWriteErrorRef = useRef<unknown>(undefined);
  const lastReceiptErrorRef = useRef<unknown>(undefined);

  useEffect(() => {
    if (!writeIsError) {
      lastWriteErrorRef.current = undefined;
      return;
    }
    if (writeError === undefined) return;
    if (lastWriteErrorRef.current === writeError) return;

    lastWriteErrorRef.current = writeError;
    const msg = getContractErrorMessage(writeError, fallbackMessage);
    if (msg === null) {
      dismissPending();
      return;
    }
    showToast("error", msg);
  }, [writeError, writeIsError, fallbackMessage]);

  useEffect(() => {
    if (!receiptIsError) {
      lastReceiptErrorRef.current = undefined;
      return;
    }
    if (receiptError === undefined) return;
    if (lastReceiptErrorRef.current === receiptError) return;

    lastReceiptErrorRef.current = receiptError;
    const msg = getContractErrorMessage(receiptError, fallbackMessage);
    if (msg === null) {
      dismissPending();
      return;
    }
    showToast("error", msg);
  }, [receiptError, receiptIsError, fallbackMessage]);
}
