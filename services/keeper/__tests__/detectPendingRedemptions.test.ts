import { describe, it, expect } from "vitest";

/**
 * Stub for pending-redemption detection logic.
 *
 * The keeper will eventually detect chains holding excess USDC earmarked
 * for pending redemptions and trigger cross-chain rebalancing. This test
 * file exercises the identification heuristic against static snapshots.
 */

interface ChainSnapshot {
  chainSelector: bigint;
  idleUsdc: bigint;
  pendingRedemptionUsdc: bigint;
}

function identifyExcessChains(
  snapshots: ChainSnapshot[],
  thresholdBps: bigint = 500n, // 5% buffer
): ChainSnapshot[] {
  return snapshots.filter((s) => {
    if (s.pendingRedemptionUsdc === 0n) return false;
    const required = s.pendingRedemptionUsdc;
    const buffer = (required * thresholdBps) / 10_000n;
    return s.idleUsdc >= required + buffer;
  });
}

describe("detectPendingRedemptions", () => {
  it("returns empty when no chains have pending redemptions", () => {
    const snapshots: ChainSnapshot[] = [
      { chainSelector: 1n, idleUsdc: 1_000_000n, pendingRedemptionUsdc: 0n },
      { chainSelector: 2n, idleUsdc: 2_000_000n, pendingRedemptionUsdc: 0n },
    ];
    expect(identifyExcessChains(snapshots)).toEqual([]);
  });

  it("identifies chain with idle exceeding pending + buffer", () => {
    const snapshots: ChainSnapshot[] = [
      {
        chainSelector: 1n,
        idleUsdc: 2_000_000n,
        pendingRedemptionUsdc: 1_000_000n,
      },
      {
        chainSelector: 2n,
        idleUsdc: 500_000n,
        pendingRedemptionUsdc: 500_000n,
      },
    ];
    const excess = identifyExcessChains(snapshots);
    expect(excess).toHaveLength(1);
    expect(excess[0].chainSelector).toBe(1n);
  });

  it("does not flag chain when idle barely covers pending (no buffer)", () => {
    const snapshots: ChainSnapshot[] = [
      {
        chainSelector: 1n,
        idleUsdc: 1_000_000n,
        pendingRedemptionUsdc: 1_000_000n,
      },
    ];
    expect(identifyExcessChains(snapshots)).toEqual([]);
  });

  it("respects custom threshold", () => {
    const snapshots: ChainSnapshot[] = [
      {
        chainSelector: 1n,
        idleUsdc: 1_100_000n,
        pendingRedemptionUsdc: 1_000_000n,
      },
    ];
    // 10% threshold → need 1_100_000; idle is exactly 1_100_000, so it matches (>=)
    expect(identifyExcessChains(snapshots, 1_000n)).toHaveLength(1);
    // 20% threshold → need 1_200_000; idle 1_100_000 is insufficient
    expect(identifyExcessChains(snapshots, 2_000n)).toEqual([]);
    // 5% threshold → need 1_050_000; idle 1_100_000 exceeds it
    expect(identifyExcessChains(snapshots, 500n)).toHaveLength(1);
  });

  it("handles all-zero state", () => {
    const snapshots: ChainSnapshot[] = [
      { chainSelector: 1n, idleUsdc: 0n, pendingRedemptionUsdc: 0n },
    ];
    expect(identifyExcessChains(snapshots)).toEqual([]);
  });

  it("identifies multiple excess chains", () => {
    const snapshots: ChainSnapshot[] = [
      {
        chainSelector: 1n,
        idleUsdc: 5_000_000n,
        pendingRedemptionUsdc: 1_000_000n,
      },
      {
        chainSelector: 2n,
        idleUsdc: 3_000_000n,
        pendingRedemptionUsdc: 500_000n,
      },
      {
        chainSelector: 3n,
        idleUsdc: 100_000n,
        pendingRedemptionUsdc: 200_000n,
      },
    ];
    const excess = identifyExcessChains(snapshots);
    expect(excess).toHaveLength(2);
    expect(excess.map((e) => e.chainSelector)).toEqual([1n, 2n]);
  });
});
