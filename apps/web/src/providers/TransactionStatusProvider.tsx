"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { useWaitForTransactionReceipt, useConfig } from "wagmi";

export type TxKind =
  | "approve"
  | "deposit"
  | "redeem"
  | "multi-chain-deposit"
  | "admin";

export type TxStatus = "signing" | "submitted" | "confirmed" | "failed";

export interface TxChildRecord {
  id: string;
  chainId: number;
  chainName: string;
  label: string;
  status: TxStatus;
  hash?: `0x${string}`;
  error?: string;
}

export interface TxRecord {
  id: string;
  kind: TxKind;
  label: string;
  chainId?: number;
  status: TxStatus;
  hash?: `0x${string}`;
  error?: string;
  createdAt: number;
  updatedAt: number;
  children?: TxChildRecord[];
  meta?: {
    explorerUrl?: string;
    onRetry?: () => void;
  };
}

type StartPayload = {
  id: string;
  kind: TxKind;
  label: string;
  chainId?: number;
  children?: TxChildRecord[];
  meta?: TxRecord["meta"];
};

export type TxStoreAction =
  | { type: "start"; payload: StartPayload }
  | {
      type: "update";
      payload: {
        id: string;
        patch: Partial<Omit<TxRecord, "id" | "createdAt">>;
      };
    }
  | {
      type: "update-child";
      payload: {
        parentId: string;
        childId: string;
        patch: Partial<TxChildRecord>;
      };
    }
  | {
      type: "complete";
      payload: {
        id: string;
        status: Extract<TxStatus, "confirmed" | "failed">;
        hash?: `0x${string}`;
        error?: string;
      };
    }
  | { type: "dismiss"; payload: { id: string } }
  | { type: "clear-completed" };

export interface TxStoreState {
  records: TxRecord[];
}

export const initialTxStoreState: TxStoreState = { records: [] };

export function txStoreReducer(state: TxStoreState, action: TxStoreAction): TxStoreState {
  switch (action.type) {
    case "start": {
      const now = Date.now();
      const existing = state.records.find((r) => r.id === action.payload.id);
      if (existing) {
        return {
          records: state.records.map((r) =>
            r.id === action.payload.id
              ? {
                  ...r,
                  ...action.payload,
                  status: "signing",
                  updatedAt: now,
                  error: undefined,
                }
              : r
          ),
        };
      }
      const next: TxRecord = {
        ...action.payload,
        status: "signing",
        createdAt: now,
        updatedAt: now,
      };
      return { records: [...state.records, next] };
    }
    case "update": {
      const now = Date.now();
      return {
        records: state.records.map((r) =>
          r.id === action.payload.id
            ? { ...r, ...action.payload.patch, updatedAt: now }
            : r
        ),
      };
    }
    case "update-child": {
      const now = Date.now();
      return {
        records: state.records.map((r) => {
          if (r.id !== action.payload.parentId || !r.children) return r;
          const children = r.children.map((c) =>
            c.id === action.payload.childId
              ? { ...c, ...action.payload.patch }
              : c
          );
          return { ...r, children, updatedAt: now };
        }),
      };
    }
    case "complete": {
      const now = Date.now();
      return {
        records: state.records.map((r) =>
          r.id === action.payload.id
            ? {
                ...r,
                status: action.payload.status,
                hash: action.payload.hash ?? r.hash,
                error: action.payload.error,
                updatedAt: now,
              }
            : r
        ),
      };
    }
    case "dismiss":
      return {
        records: state.records.filter((r) => r.id !== action.payload.id),
      };
    case "clear-completed":
      return {
        records: state.records.filter(
          (r) => r.status === "signing" || r.status === "submitted"
        ),
      };
    default:
      return state;
  }
}

export interface StartTxInput {
  id?: string;
  kind: TxKind;
  label: string;
  chainId?: number;
  children?: TxChildRecord[];
  meta?: TxRecord["meta"];
}

export interface TransactionStatusContextValue {
  records: TxRecord[];
  activeTxs: TxRecord[];
  inFlightCount: number;
  latestTx: TxRecord | undefined;
  startTx: (input: StartTxInput) => string;
  updateTx: (
    id: string,
    patch: Partial<Omit<TxRecord, "id" | "createdAt">>
  ) => void;
  updateChild: (
    parentId: string,
    childId: string,
    patch: Partial<TxChildRecord>
  ) => void;
  markSubmitted: (id: string, hash: `0x${string}`) => void;
  completeTx: (
    id: string,
    args: { hash?: `0x${string}` }
  ) => void;
  failTx: (id: string, error: string) => void;
  dismissTx: (id: string) => void;
  clearCompleted: () => void;
  getExplorerUrl: (
    chainId: number,
    hash: `0x${string}`
  ) => string | undefined;
}

const TransactionStatusContext =
  createContext<TransactionStatusContextValue | null>(null);

let txIdCounter = 0;
function makeTxId(): string {
  txIdCounter += 1;
  return `tx_${Date.now().toString(36)}_${txIdCounter}`;
}

export function TransactionStatusProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(txStoreReducer, initialTxStoreState);
  const wagmiConfig = useConfig();

  const getExplorerUrl = useCallback(
    (chainId: number, hash: `0x${string}`) => {
      const base = wagmiConfig.chains.find((c) => c.id === chainId)
        ?.blockExplorers?.default?.url;
      return base ? `${base}/tx/${hash}` : undefined;
    },
    [wagmiConfig.chains]
  );

  const startTx = useCallback((input: StartTxInput) => {
    const id = input.id ?? makeTxId();
    dispatch({
      type: "start",
      payload: {
        id,
        kind: input.kind,
        label: input.label,
        chainId: input.chainId,
        children: input.children,
        meta: input.meta,
      },
    });
    return id;
  }, []);

  const updateTx = useCallback<
    TransactionStatusContextValue["updateTx"]
  >((id, patch) => {
    dispatch({ type: "update", payload: { id, patch } });
  }, []);

  const updateChild = useCallback<
    TransactionStatusContextValue["updateChild"]
  >((parentId, childId, patch) => {
    dispatch({ type: "update-child", payload: { parentId, childId, patch } });
  }, []);

  const markSubmitted = useCallback<
    TransactionStatusContextValue["markSubmitted"]
  >((id, hash) => {
    dispatch({
      type: "update",
      payload: { id, patch: { status: "submitted", hash } },
    });
  }, []);

  const completeTx = useCallback<
    TransactionStatusContextValue["completeTx"]
  >((id, { hash }) => {
    dispatch({
      type: "complete",
      payload: { id, status: "confirmed", hash },
    });
  }, []);

  const failTx = useCallback<TransactionStatusContextValue["failTx"]>(
    (id, error) => {
      dispatch({
        type: "complete",
        payload: { id, status: "failed", error },
      });
    },
    []
  );

  const dismissTx = useCallback<TransactionStatusContextValue["dismissTx"]>(
    (id) => {
      dispatch({ type: "dismiss", payload: { id } });
    },
    []
  );

  const clearCompleted = useCallback(() => {
    dispatch({ type: "clear-completed" });
  }, []);

  const value = useMemo<TransactionStatusContextValue>(() => {
    const active = state.records.filter(
      (r) => r.status === "signing" || r.status === "submitted"
    );
    return {
      records: state.records,
      activeTxs: active,
      inFlightCount: active.length,
      latestTx: state.records[state.records.length - 1],
      startTx,
      updateTx,
      updateChild,
      markSubmitted,
      completeTx,
      failTx,
      dismissTx,
      clearCompleted,
      getExplorerUrl,
    };
  }, [
    clearCompleted,
    completeTx,
    dismissTx,
    failTx,
    getExplorerUrl,
    markSubmitted,
    startTx,
    state.records,
    updateChild,
    updateTx,
  ]);

  return (
    <TransactionStatusContext.Provider value={value}>
      {children}
    </TransactionStatusContext.Provider>
  );
}

export function useTransactionStatus(): TransactionStatusContextValue {
  const ctx = useContext(TransactionStatusContext);
  if (!ctx) {
    throw new Error(
      "useTransactionStatus must be used within a TransactionStatusProvider"
    );
  }
  return ctx;
}

/**
 * Optional hook variant that returns null when no provider is mounted.
 * Useful for hooks that may run in both Privy-enabled and fallback trees.
 */
export function useOptionalTransactionStatus(): TransactionStatusContextValue | null {
  return useContext(TransactionStatusContext);
}

/**
 * Bridges a wagmi-style write to the transaction store. Call `start(label, ...)`
 * when the action fires; pass the resulting hash via `markSubmitted` (the hook
 * does this automatically when you re-render with the hash). Pass the
 * receipt status (success/error) and a wagmi receipt query result to wire
 * the lifecycle to the dock without each call site repeating the logic.
 */
export function useTrackedTx(args: {
  hash: `0x${string}` | undefined;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  receipt: {
    isSuccess: boolean;
    isError: boolean;
    error: Error | null;
  };
  kind: TxKind;
  label: string;
  chainId?: number;
}) {
  const tx = useOptionalTransactionStatus();
  const txIdRef = useRef<string | null>(null);
  const lastSignalRef = useRef<{
    isPending: boolean;
    hash?: `0x${string}`;
    receiptSuccess: boolean;
    receiptError: boolean;
    writeError: boolean;
  }>({
    isPending: false,
    hash: undefined,
    receiptSuccess: false,
    receiptError: false,
    writeError: false,
  });

  useEffect(() => {
    if (!tx) return;
    const prev = lastSignalRef.current;

    if (args.isPending && !prev.isPending) {
      const id = tx.startTx({
        kind: args.kind,
        label: args.label,
        chainId: args.chainId,
      });
      txIdRef.current = id;
    }

    if (args.hash && args.hash !== prev.hash && txIdRef.current) {
      tx.markSubmitted(txIdRef.current, args.hash);
    }

    if (
      args.receipt.isSuccess &&
      !prev.receiptSuccess &&
      txIdRef.current
    ) {
      tx.completeTx(txIdRef.current, { hash: args.hash });
      txIdRef.current = null;
    }

    const receiptFailed = args.receipt.isError && !prev.receiptError;
    const writeFailed = args.isError && !prev.writeError && !args.isPending;
    if ((receiptFailed || writeFailed) && txIdRef.current) {
      const msg =
        args.receipt.error?.message ??
        args.error?.message ??
        "Transaction failed";
      tx.failTx(txIdRef.current, msg);
      txIdRef.current = null;
    }

    lastSignalRef.current = {
      isPending: args.isPending,
      hash: args.hash,
      receiptSuccess: args.receipt.isSuccess,
      receiptError: args.receipt.isError,
      writeError: args.isError,
    };
  }, [
    args.chainId,
    args.error,
    args.hash,
    args.isError,
    args.isPending,
    args.kind,
    args.label,
    args.receipt.error,
    args.receipt.isError,
    args.receipt.isSuccess,
    tx,
  ]);
}

/**
 * Convenience hook for surfaces that just want to read the current
 * transaction matching a wagmi hash. Avoids forcing every panel to wire
 * up `useWaitForTransactionReceipt` plus the store separately.
 */
export function useTxByHash(hash: `0x${string}` | undefined) {
  const tx = useOptionalTransactionStatus();
  if (!hash || !tx) return undefined;
  return tx.records.find((r) => r.hash === hash);
}

// Re-export the wagmi hook so consumers can keep a single import surface
// when migrating call sites later.
export { useWaitForTransactionReceipt };
