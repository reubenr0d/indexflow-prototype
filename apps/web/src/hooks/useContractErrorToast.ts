"use client";

import { useEffect, useRef } from "react";
import { BaseError, ContractFunctionRevertedError } from "viem";
import { showToast } from "@/components/ui/toast";

function formatCustomError(errorName: string, args: readonly unknown[] | undefined) {
  if (!args || args.length === 0) return errorName;
  const formattedArgs = args.map((arg) => String(arg)).join(", ");
  return `${errorName}(${formattedArgs})`;
}

export function getContractErrorMessage(error: unknown, fallbackMessage: string) {
  if (!error) return fallbackMessage;

  if (error instanceof BaseError) {
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
    showToast("error", getContractErrorMessage(writeError, fallbackMessage));
  }, [writeError, writeIsError, receiptError, receiptIsError, fallbackMessage]);

  useEffect(() => {
    if (!receiptIsError) {
      lastReceiptErrorRef.current = undefined;
      return;
    }
    if (receiptError === undefined) return;
    if (lastReceiptErrorRef.current === receiptError) return;

    lastReceiptErrorRef.current = receiptError;
    showToast("error", getContractErrorMessage(receiptError, fallbackMessage));
  }, [receiptError, receiptIsError, fallbackMessage]);
}
