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
  const lastToastKeyRef = useRef<string>("");

  useEffect(() => {
    if (!writeIsError && !receiptIsError) return;

    const errorSource = writeIsError ? writeError : receiptError;
    const message = getContractErrorMessage(errorSource, fallbackMessage);
    const toastKey = `${writeIsError ? "write" : "receipt"}:${message}`;

    if (lastToastKeyRef.current === toastKey) return;
    lastToastKeyRef.current = toastKey;

    showToast("error", message);
  }, [writeError, writeIsError, receiptError, receiptIsError, fallbackMessage]);
}
