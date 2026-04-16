import { describe, it, expect, vi } from "vitest";
import { computeRoutingWeights } from "../src/computeRoutingWeights.js";
import { computeGlobalNav } from "../src/computeGlobalNav.js";

/**
 * Tests for staleness and RPC failure handling.
 *
 * In production the keeper must not relay stale data when RPCs are down.
 * These tests verify that the computation layer degrades gracefully and
 * that a thin staleness guard correctly rejects outdated reads.
 */

const USDC = (n: number) => BigInt(Math.round(n * 1e6));

interface ReadResult {
  chainSelector: bigint;
  idleUsdc: bigint;
  readTimestamp: number;
  success: boolean;
}

/**
 * Checks whether any chain read is stale (older than maxAgeSeconds).
 * Returns the stale chain selectors so the keeper can skip the epoch.
 */
function findStaleReads(
  reads: ReadResult[],
  maxAgeSeconds: number,
  now: number = Math.floor(Date.now() / 1000),
): bigint[] {
  return reads
    .filter((r) => !r.success || now - r.readTimestamp > maxAgeSeconds)
    .map((r) => r.chainSelector);
}

describe("staleness guard", () => {
  it("returns empty when all reads are fresh and successful", () => {
    const now = Math.floor(Date.now() / 1000);
    const reads: ReadResult[] = [
      { chainSelector: 1n, idleUsdc: USDC(100), readTimestamp: now, success: true },
      { chainSelector: 2n, idleUsdc: USDC(200), readTimestamp: now - 5, success: true },
    ];
    expect(findStaleReads(reads, 30, now)).toEqual([]);
  });

  it("flags chains with old timestamps as stale", () => {
    const now = Math.floor(Date.now() / 1000);
    const reads: ReadResult[] = [
      { chainSelector: 1n, idleUsdc: USDC(100), readTimestamp: now, success: true },
      { chainSelector: 2n, idleUsdc: USDC(200), readTimestamp: now - 120, success: true },
    ];
    const stale = findStaleReads(reads, 60, now);
    expect(stale).toEqual([2n]);
  });

  it("flags failed reads as stale regardless of timestamp", () => {
    const now = Math.floor(Date.now() / 1000);
    const reads: ReadResult[] = [
      { chainSelector: 1n, idleUsdc: 0n, readTimestamp: now, success: false },
      { chainSelector: 2n, idleUsdc: USDC(200), readTimestamp: now, success: true },
    ];
    const stale = findStaleReads(reads, 60, now);
    expect(stale).toEqual([1n]);
  });

  it("flags all chains when everything is stale", () => {
    const now = Math.floor(Date.now() / 1000);
    const reads: ReadResult[] = [
      { chainSelector: 1n, idleUsdc: USDC(100), readTimestamp: now - 300, success: true },
      { chainSelector: 2n, idleUsdc: 0n, readTimestamp: now - 300, success: false },
    ];
    const stale = findStaleReads(reads, 60, now);
    expect(stale).toHaveLength(2);
  });
});

describe("graceful degradation with partial data", () => {
  it("routing weights work with subset of chains after filtering stale ones", () => {
    const allChains = [
      { chainSelector: 1n, idleUsdc: USDC(1000) },
      { chainSelector: 2n, idleUsdc: USDC(2000) },
      { chainSelector: 3n, idleUsdc: USDC(3000) },
    ];

    const staleSelectors = new Set([2n]);
    const freshChains = allChains.filter(
      (c) => !staleSelectors.has(c.chainSelector),
    );

    const weights = computeRoutingWeights(freshChains);
    expect(weights).toHaveLength(2);
    const total = weights.reduce((s, w) => s + w.weightBps, 0n);
    expect(total).toBe(10_000n);
  });

  it("PnL adjustments degrade safely when hub is stale", () => {
    const chains = [
      { chainSelector: 1n, idleUsdc: USDC(500), isHub: true },
      { chainSelector: 2n, idleUsdc: USDC(500), isHub: false },
    ];

    // If hub PnL is unavailable, keeper should use 0 as safe default
    const adjustments = computeGlobalNav(chains, 0n, 0n);
    for (const adj of adjustments) {
      expect(adj.pnlAdjustment).toBe(0n);
    }
  });

  it("PnL adjustments degrade safely when a spoke is stale (excluded)", () => {
    const chains = [
      { chainSelector: 1n, idleUsdc: USDC(1000), isHub: true },
      { chainSelector: 3n, idleUsdc: USDC(500), isHub: false },
    ];

    // Spoke 2 was stale and excluded; the remaining spoke still gets its share
    const adjustments = computeGlobalNav(chains, USDC(400), USDC(100));
    const spoke3 = adjustments.find((a) => a.chainSelector === 3n)!;
    // 500 / 1500 * 100 = 33.333... → truncated to 33 USDC (bigint division)
    expect(spoke3.pnlAdjustment).toBe((USDC(500) * USDC(100)) / USDC(1500));
  });
});

describe("keeper should not post stale data", () => {
  it("epoch should be skipped when any read is stale", () => {
    const now = Math.floor(Date.now() / 1000);
    const reads: ReadResult[] = [
      { chainSelector: 1n, idleUsdc: USDC(100), readTimestamp: now, success: true },
      { chainSelector: 2n, idleUsdc: USDC(200), readTimestamp: now - 300, success: true },
    ];

    const stale = findStaleReads(reads, 60, now);
    const shouldSkipEpoch = stale.length > 0;

    expect(shouldSkipEpoch).toBe(true);
    expect(stale).toEqual([2n]);
  });

  it("epoch proceeds when all reads are fresh", () => {
    const now = Math.floor(Date.now() / 1000);
    const reads: ReadResult[] = [
      { chainSelector: 1n, idleUsdc: USDC(100), readTimestamp: now - 10, success: true },
      { chainSelector: 2n, idleUsdc: USDC(200), readTimestamp: now - 5, success: true },
    ];

    const stale = findStaleReads(reads, 60, now);
    expect(stale).toHaveLength(0);
  });
});
