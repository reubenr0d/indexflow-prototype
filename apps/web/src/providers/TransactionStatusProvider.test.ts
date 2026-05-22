import { describe, expect, it } from "vitest";
import * as TransactionStatusProviderModule from "./TransactionStatusProvider";
import {
  initialTxStoreState,
  txStoreReducer,
  type TxChildRecord,
} from "./TransactionStatusProvider";

describe("txStoreReducer", () => {
  it("registers a new record on `start` and defaults to the signing status", () => {
    const next = txStoreReducer(initialTxStoreState, {
      type: "start",
      payload: {
        id: "tx-1",
        kind: "deposit",
        label: "Deposit 100 USDC",
        chainId: 11_155_111,
      },
    });

    expect(next.records).toHaveLength(1);
    expect(next.records[0]).toMatchObject({
      id: "tx-1",
      kind: "deposit",
      label: "Deposit 100 USDC",
      chainId: 11_155_111,
      status: "signing",
    });
    expect(typeof next.records[0].createdAt).toBe("number");
    expect(typeof next.records[0].updatedAt).toBe("number");
  });

  it("`start` with an existing id rewrites the label, chain, and resets status to signing", () => {
    const after_start = txStoreReducer(initialTxStoreState, {
      type: "start",
      payload: { id: "tx-1", kind: "deposit", label: "Original" },
    });
    const after_fail = txStoreReducer(after_start, {
      type: "complete",
      payload: { id: "tx-1", status: "failed", error: "boom" },
    });

    const reseeded = txStoreReducer(after_fail, {
      type: "start",
      payload: { id: "tx-1", kind: "deposit", label: "Retry deposit" },
    });

    expect(reseeded.records).toHaveLength(1);
    expect(reseeded.records[0].status).toBe("signing");
    expect(reseeded.records[0].label).toBe("Retry deposit");
    expect(reseeded.records[0].error).toBeUndefined();
  });

  it("transitions signing -> submitted via `update` (status + hash)", () => {
    let state = txStoreReducer(initialTxStoreState, {
      type: "start",
      payload: { id: "tx-1", kind: "deposit", label: "Deposit" },
    });

    state = txStoreReducer(state, {
      type: "update",
      payload: {
        id: "tx-1",
        patch: { status: "submitted", hash: "0xabc" as `0x${string}` },
      },
    });

    expect(state.records[0].status).toBe("submitted");
    expect(state.records[0].hash).toBe("0xabc");
  });

  it("`complete` marks the record confirmed and stores the hash", () => {
    let state = txStoreReducer(initialTxStoreState, {
      type: "start",
      payload: { id: "tx-1", kind: "deposit", label: "Deposit" },
    });
    state = txStoreReducer(state, {
      type: "complete",
      payload: {
        id: "tx-1",
        status: "confirmed",
        hash: "0xdef" as `0x${string}`,
      },
    });

    expect(state.records[0].status).toBe("confirmed");
    expect(state.records[0].hash).toBe("0xdef");
    expect(state.records[0].error).toBeUndefined();
  });

  it("`complete` to failed stores the error message", () => {
    let state = txStoreReducer(initialTxStoreState, {
      type: "start",
      payload: { id: "tx-1", kind: "deposit", label: "Deposit" },
    });
    state = txStoreReducer(state, {
      type: "complete",
      payload: { id: "tx-1", status: "failed", error: "user rejected" },
    });

    expect(state.records[0].status).toBe("failed");
    expect(state.records[0].error).toBe("user rejected");
  });

  it("`dismiss` removes the record entirely", () => {
    let state = txStoreReducer(initialTxStoreState, {
      type: "start",
      payload: { id: "tx-1", kind: "deposit", label: "Deposit" },
    });
    state = txStoreReducer(state, {
      type: "dismiss",
      payload: { id: "tx-1" },
    });
    expect(state.records).toHaveLength(0);
  });

  it("`clear-completed` keeps only in-flight (signing | submitted) records", () => {
    let state = txStoreReducer(initialTxStoreState, {
      type: "start",
      payload: { id: "in-flight", kind: "deposit", label: "In flight" },
    });
    state = txStoreReducer(state, {
      type: "start",
      payload: { id: "done", kind: "approve", label: "Done" },
    });
    state = txStoreReducer(state, {
      type: "complete",
      payload: { id: "done", status: "confirmed" },
    });
    state = txStoreReducer(state, {
      type: "start",
      payload: { id: "failed", kind: "redeem", label: "Failed" },
    });
    state = txStoreReducer(state, {
      type: "complete",
      payload: { id: "failed", status: "failed", error: "x" },
    });
    state = txStoreReducer(state, {
      type: "start",
      payload: { id: "submitted", kind: "deposit", label: "Mid-flight" },
    });
    state = txStoreReducer(state, {
      type: "update",
      payload: { id: "submitted", patch: { status: "submitted" } },
    });

    const after = txStoreReducer(state, { type: "clear-completed" });

    expect(after.records.map((r) => r.id).sort()).toEqual([
      "in-flight",
      "submitted",
    ]);
  });

  it("`update-child` updates one child without disturbing the others", () => {
    const children: TxChildRecord[] = [
      {
        id: "chain-1",
        chainId: 1,
        chainName: "Ethereum",
        label: "100 USDC",
        status: "signing",
      },
      {
        id: "chain-2",
        chainId: 42_161,
        chainName: "Arbitrum",
        label: "50 USDC",
        status: "signing",
      },
    ];
    let state = txStoreReducer(initialTxStoreState, {
      type: "start",
      payload: {
        id: "multi",
        kind: "multi-chain-deposit",
        label: "Multi",
        children,
      },
    });

    state = txStoreReducer(state, {
      type: "update-child",
      payload: {
        parentId: "multi",
        childId: "chain-2",
        patch: { status: "confirmed", hash: "0x111" as `0x${string}` },
      },
    });

    const parent = state.records[0];
    expect(parent.children?.[0].status).toBe("signing");
    expect(parent.children?.[1].status).toBe("confirmed");
    expect(parent.children?.[1].hash).toBe("0x111");
  });

  it("`update-child` on a parent without children is a no-op", () => {
    const before = txStoreReducer(initialTxStoreState, {
      type: "start",
      payload: { id: "no-kids", kind: "deposit", label: "Solo" },
    });
    const after = txStoreReducer(before, {
      type: "update-child",
      payload: {
        parentId: "no-kids",
        childId: "anything",
        patch: { status: "confirmed" },
      },
    });
    expect(after).toEqual(before);
  });

  // This is the property that, when combined with subscribing to the full
  // context value, caused the "Maximum update depth exceeded" loop in the
  // deposit confirm modal: each `update-child` dispatch creates a new
  // `records` array, which used to rebuild the combined context value
  // every render. The fix is the split state/actions contexts (see below);
  // this test pins the underlying reducer behavior so future refactors are
  // forced to either preserve the records reference or keep the context
  // split intact.
  it("`update-child` always produces a new records array (the loop-trigger condition)", () => {
    const children: TxChildRecord[] = [
      {
        id: "chain-1",
        chainId: 1,
        chainName: "Ethereum",
        label: "50 USDC",
        status: "signing",
      },
    ];
    const seeded = txStoreReducer(initialTxStoreState, {
      type: "start",
      payload: {
        id: "multi",
        kind: "multi-chain-deposit",
        label: "Multi",
        children,
      },
    });

    const firstDispatch = txStoreReducer(seeded, {
      type: "update-child",
      payload: {
        parentId: "multi",
        childId: "chain-1",
        patch: { status: "submitted" },
      },
    });
    const secondDispatch = txStoreReducer(firstDispatch, {
      type: "update-child",
      payload: {
        parentId: "multi",
        childId: "chain-1",
        patch: { status: "submitted" },
      },
    });

    expect(firstDispatch.records).not.toBe(seeded.records);
    expect(secondDispatch.records).not.toBe(firstDispatch.records);
  });

  // `meta.onResume` is set by the deposit confirm modal at `startTx` time so a
  // tap on the dock card can re-open the minimized modal. The modal clears it
  // via `updateTx(id, { meta: undefined })` once the parent record is
  // confirmed (no value in re-opening a successful deposit), but deliberately
  // leaves it in place on failure so the user can re-open and hit Retry.
  // This test pins both halves of that contract at the reducer level.
  it("`start` accepts a meta.onResume callback and `update` with meta: undefined clears it", () => {
    const onResume = () => undefined;
    const seeded = txStoreReducer(initialTxStoreState, {
      type: "start",
      payload: {
        id: "tx-1",
        kind: "multi-chain-deposit",
        label: "Multi-chain deposit · 100 USDC",
        meta: { onResume },
      },
    });
    expect(seeded.records[0].meta?.onResume).toBe(onResume);

    const cleared = txStoreReducer(seeded, {
      type: "update",
      payload: { id: "tx-1", patch: { meta: undefined } },
    });
    expect(cleared.records[0].meta).toBeUndefined();
  });

  // Verifies the failure path keeps the resume affordance available: the
  // wrapper only calls `updateTx({ meta: undefined })` on the success branch,
  // so a `complete` -> failed transition must not touch meta on its own.
  it("`complete` to failed leaves the meta.onResume callback intact", () => {
    const onResume = () => undefined;
    let state = txStoreReducer(initialTxStoreState, {
      type: "start",
      payload: {
        id: "tx-1",
        kind: "deposit",
        label: "Deposit",
        meta: { onResume },
      },
    });
    state = txStoreReducer(state, {
      type: "complete",
      payload: { id: "tx-1", status: "failed", error: "boom" },
    });
    expect(state.records[0].status).toBe("failed");
    expect(state.records[0].meta?.onResume).toBe(onResume);
  });
});

describe("TransactionStatusProvider exports (API surface)", () => {
  it("exposes split state and actions hooks alongside the legacy combined hook", () => {
    expect(typeof TransactionStatusProviderModule.useTransactionState).toBe(
      "function"
    );
    expect(
      typeof TransactionStatusProviderModule.useOptionalTransactionState
    ).toBe("function");
    expect(typeof TransactionStatusProviderModule.useTransactionActions).toBe(
      "function"
    );
    expect(
      typeof TransactionStatusProviderModule.useOptionalTransactionActions
    ).toBe("function");
    // Backwards-compat hooks must remain for unaudited callers.
    expect(typeof TransactionStatusProviderModule.useTransactionStatus).toBe(
      "function"
    );
    expect(
      typeof TransactionStatusProviderModule.useOptionalTransactionStatus
    ).toBe("function");
  });
});
