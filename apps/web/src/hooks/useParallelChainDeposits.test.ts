import { describe, expect, it } from "vitest";
import {
  computeDepositSplits,
  computeNeedsApprovalPerChain,
  type DepositSplit,
} from "./useParallelChainDeposits";

const SEPOLIA_SELECTOR = "16015286601757825753";
const FUJI_SELECTOR = "14767482510784806043";
const ARB_SEPOLIA_SELECTOR = "3478487238524512106";

const SEPOLIA_CHAIN_ID = 11155111;
const FUJI_CHAIN_ID = 43113;

describe("computeDepositSplits", () => {
  it("collapses to the highest-weight chain when total is below the multi-split minimum", () => {
    const splits = computeDepositSplits(5_000_000n, [
      { chainSelector: BigInt(SEPOLIA_SELECTOR), chainName: "sepolia", weightBps: 6_000 },
      { chainSelector: BigInt(FUJI_SELECTOR), chainName: "fuji", weightBps: 4_000 },
    ]);
    expect(splits).toHaveLength(1);
    expect(splits[0].chainId).toBe(SEPOLIA_CHAIN_ID);
    expect(splits[0].amount).toBe(5_000_000n);
    expect(splits[0].percentage).toBe(100);
  });

  it("spreads above-threshold totals proportional to weights and sums back to the input", () => {
    const total = 100_000_000n; // 100 USDC
    const splits = computeDepositSplits(total, [
      { chainSelector: BigInt(SEPOLIA_SELECTOR), chainName: "sepolia", weightBps: 5_000 },
      { chainSelector: BigInt(FUJI_SELECTOR), chainName: "fuji", weightBps: 3_000 },
      { chainSelector: BigInt(ARB_SEPOLIA_SELECTOR), chainName: "arbitrum-sepolia", weightBps: 2_000 },
    ]);
    expect(splits).toHaveLength(3);
    const sum = splits.reduce((acc, s) => acc + s.amount, 0n);
    expect(sum).toBe(total);
    expect(splits.every((s) => s.amount >= 10_000_000n)).toBe(true);
  });

  it("returns no splits when weights are empty or the amount is zero", () => {
    expect(computeDepositSplits(100_000_000n, [])).toEqual([]);
    expect(
      computeDepositSplits(0n, [
        { chainSelector: BigInt(SEPOLIA_SELECTOR), chainName: "sepolia", weightBps: 1 },
      ])
    ).toEqual([]);
  });
});

describe("computeNeedsApprovalPerChain", () => {
  const splits: DepositSplit[] = [
    {
      chainId: SEPOLIA_CHAIN_ID,
      chainSelector: BigInt(SEPOLIA_SELECTOR),
      chainName: "sepolia",
      amount: 25_000_000n,
      percentage: 50,
    },
    {
      chainId: FUJI_CHAIN_ID,
      chainSelector: BigInt(FUJI_SELECTOR),
      chainName: "fuji",
      amount: 25_000_000n,
      percentage: 50,
    },
  ];

  it("marks chains with insufficient allowance as needing approval", () => {
    const result = computeNeedsApprovalPerChain(splits, {
      [SEPOLIA_CHAIN_ID]: 10_000_000n,
      [FUJI_CHAIN_ID]: 0n,
    });
    expect(result[SEPOLIA_CHAIN_ID]).toBe(true);
    expect(result[FUJI_CHAIN_ID]).toBe(true);
  });

  it("skips approval when the existing allowance already covers the split amount", () => {
    const result = computeNeedsApprovalPerChain(splits, {
      [SEPOLIA_CHAIN_ID]: 30_000_000n,
      [FUJI_CHAIN_ID]: 25_000_000n,
    });
    expect(result[SEPOLIA_CHAIN_ID]).toBe(false);
    expect(result[FUJI_CHAIN_ID]).toBe(false);
  });

  it("treats a missing allowance entry as needs-approval", () => {
    const result = computeNeedsApprovalPerChain(splits, {
      [SEPOLIA_CHAIN_ID]: 30_000_000n,
    });
    expect(result[FUJI_CHAIN_ID]).toBe(true);
  });
});
