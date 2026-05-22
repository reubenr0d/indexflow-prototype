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
    // Re-open the originating modal/drawer for this record. The deposit
    // confirm modal sets this when execution starts so the user can minimize
    // the dialog mid-flight and tap the dock card to maximize it back.
    // Cleared once the parent record reaches a terminal state where there's
    // nothing useful to re-open.
    onResume?: () => void;
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

/**
 * Read-only slice of the transaction store. Re-renders any consumer
 * whenever `state.records` changes. Use this in surfaces that actually
 * display transaction state (e.g. the dock). Action-only consumers
 * should use `TransactionActionsContext` instead so they don't re-render
 * (and re-trigger effects) on every records mutation.
 */
export interface TransactionStateContextValue {
  records: TxRecord[];
  activeTxs: TxRecord[];
  inFlightCount: number;
  latestTx: TxRecord | undefined;
}

/**
 * Stable-by-construction slice of the transaction store. The methods are
 * wrapped in `useCallback` so the value reference does not change when
 * records mutate; safe to put in `useEffect` dep arrays.
 */
export interface TransactionActionsContextValue {
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

/**
 * Combined value, kept for backwards compatibility with existing call sites.
 * Prefer the split hooks (`useTransactionState` / `useTransactionActions`)
 * in new code so action-only consumers don't subscribe to records updates.
 */
export interface TransactionStatusContextValue
  extends TransactionStateContextValue,
    TransactionActionsContextValue {}

const TransactionStateContext =
  createContext<TransactionStateContextValue | null>(null);
const TransactionActionsContext =
  createContext<TransactionActionsContextValue | null>(null);

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

  const updateTx = useCallback<TransactionActionsContextValue["updateTx"]>(
    (id, patch) => {
      dispatch({ type: "update", payload: { id, patch } });
    },
    []
  );

  const updateChild = useCallback<
    TransactionActionsContextValue["updateChild"]
  >((parentId, childId, patch) => {
    dispatch({ type: "update-child", payload: { parentId, childId, patch } });
  }, []);

  const markSubmitted = useCallback<
    TransactionActionsContextValue["markSubmitted"]
  >((id, hash) => {
    dispatch({
      type: "update",
      payload: { id, patch: { status: "submitted", hash } },
    });
  }, []);

  const completeTx = useCallback<
    TransactionActionsContextValue["completeTx"]
  >((id, { hash }) => {
    dispatch({
      type: "complete",
      payload: { id, status: "confirmed", hash },
    });
  }, []);

  const failTx = useCallback<TransactionActionsContextValue["failTx"]>(
    (id, error) => {
      dispatch({
        type: "complete",
        payload: { id, status: "failed", error },
      });
    },
    []
  );

  const dismissTx = useCallback<TransactionActionsContextValue["dismissTx"]>(
    (id) => {
      dispatch({ type: "dismiss", payload: { id } });
    },
    []
  );

  const clearCompleted = useCallback(() => {
    dispatch({ type: "clear-completed" });
  }, []);

  const actionsValue = useMemo<TransactionActionsContextValue>(
    () => ({
      startTx,
      updateTx,
      updateChild,
      markSubmitted,
      completeTx,
      failTx,
      dismissTx,
      clearCompleted,
      getExplorerUrl,
    }),
    [
      clearCompleted,
      completeTx,
      dismissTx,
      failTx,
      getExplorerUrl,
      markSubmitted,
      startTx,
      updateChild,
      updateTx,
    ]
  );

  const stateValue = useMemo<TransactionStateContextValue>(() => {
    const active = state.records.filter(
      (r) => r.status === "signing" || r.status === "submitted"
    );
    return {
      records: state.records,
      activeTxs: active,
      inFlightCount: active.length,
      latestTx: state.records[state.records.length - 1],
    };
  }, [state.records]);

  return (
    <TransactionActionsContext.Provider value={actionsValue}>
      <TransactionStateContext.Provider value={stateValue}>
        {children}
      </TransactionStateContext.Provider>
    </TransactionActionsContext.Provider>
  );
}

export function useTransactionState(): TransactionStateContextValue {
  const ctx = useContext(TransactionStateContext);
  if (!ctx) {
    throw new Error(
      "useTransactionState must be used within a TransactionStatusProvider"
    );
  }
  return ctx;
}

/**
 * Optional state-only hook. Returns null when no provider is mounted.
 */
export function useOptionalTransactionState(): TransactionStateContextValue | null {
  return useContext(TransactionStateContext);
}

export function useTransactionActions(): TransactionActionsContextValue {
  const ctx = useContext(TransactionActionsContext);
  if (!ctx) {
    throw new Error(
      "useTransactionActions must be used within a TransactionStatusProvider"
    );
  }
  return ctx;
}

/**
 * Optional actions-only hook. Returns null when no provider is mounted.
 *
 * Prefer this over `useOptionalTransactionStatus` for any consumer that
 * only dispatches into the store: the returned value reference is stable
 * across records updates, so putting it in a `useEffect` dep array won't
 * cause re-fires when an unrelated transaction changes.
 */
export function useOptionalTransactionActions(): TransactionActionsContextValue | null {
  return useContext(TransactionActionsContext);
}

/**
 * Combined hook for backwards compatibility.
 *
 * NOTE: returns a new object reference on every render. Do NOT put the
 * returned value in a `useEffect` dep array — the effect will re-fire on
 * every records mutation (and risks infinite loops if the effect itself
 * dispatches into the store). Prefer the split hooks
 * (`useTransactionState` / `useTransactionActions`) in new code.
 */
export function useTransactionStatus(): TransactionStatusContextValue {
  const stateValue = useTransactionState();
  const actionsValue = useTransactionActions();
  return { ...stateValue, ...actionsValue };
}

/**
 * Optional combined hook, returns null when no provider is mounted.
 *
 * Same caveat as `useTransactionStatus`: returns a fresh object reference
 * on every render. Don't put it in dep arrays.
 */
export function useOptionalTransactionStatus(): TransactionStatusContextValue | null {
  const stateValue = useOptionalTransactionState();
  const actionsValue = useOptionalTransactionActions();
  if (!stateValue || !actionsValue) return null;
  return { ...stateValue, ...actionsValue };
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
  const actions = useOptionalTransactionActions();
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
    if (!actions) return;
    const prev = lastSignalRef.current;

    if (args.isPending && !prev.isPending) {
      const id = actions.startTx({
        kind: args.kind,
        label: args.label,
        chainId: args.chainId,
      });
      txIdRef.current = id;
    }

    if (args.hash && args.hash !== prev.hash && txIdRef.current) {
      actions.markSubmitted(txIdRef.current, args.hash);
    }

    if (
      args.receipt.isSuccess &&
      !prev.receiptSuccess &&
      txIdRef.current
    ) {
      actions.completeTx(txIdRef.current, { hash: args.hash });
      txIdRef.current = null;
    }

    const receiptFailed = args.receipt.isError && !prev.receiptError;
    const writeFailed = args.isError && !prev.writeError && !args.isPending;
    if ((receiptFailed || writeFailed) && txIdRef.current) {
      const msg =
        args.receipt.error?.message ??
        args.error?.message ??
        "Transaction failed";
      actions.failTx(txIdRef.current, msg);
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
    actions,
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
  ]);
}

/**
 * Convenience hook for surfaces that just want to read the current
 * transaction matching a wagmi hash. Avoids forcing every panel to wire
 * up `useWaitForTransactionReceipt` plus the store separately.
 */
export function useTxByHash(hash: `0x${string}` | undefined) {
  const stateValue = useOptionalTransactionState();
  if (!hash || !stateValue) return undefined;
  return stateValue.records.find((r) => r.hash === hash);
}

// Re-export the wagmi hook so consumers can keep a single import surface
// when migrating call sites later.
export { useWaitForTransactionReceipt };
