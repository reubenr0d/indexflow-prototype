import { describe, expect, it } from "vitest";
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
});
