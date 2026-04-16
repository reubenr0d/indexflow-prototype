import { describe, it, expect } from "vitest";
import {
  computeRoutingWeights,
  type ChainReserve,
} from "../src/computeRoutingWeights.js";

const BPS = 10_000n;

function sumWeights(weights: { weightBps: bigint }[]): bigint {
  return weights.reduce((s, w) => s + w.weightBps, 0n);
}

describe("computeRoutingWeights", () => {
  it("returns empty array for empty input", () => {
    expect(computeRoutingWeights([])).toEqual([]);
  });

  it("gives single chain 100% (10000 bps)", () => {
    const reserves: ChainReserve[] = [
      { chainSelector: 1n, idleUsdc: 500_000_000n },
    ];
    const weights = computeRoutingWeights(reserves);
    expect(weights).toHaveLength(1);
    expect(weights[0].weightBps).toBe(BPS);
  });

  it("weights always sum to exactly 10000 bps", () => {
    const reserves: ChainReserve[] = [
      { chainSelector: 1n, idleUsdc: 1_000_000n },
      { chainSelector: 2n, idleUsdc: 3_000_000n },
      { chainSelector: 3n, idleUsdc: 6_000_000n },
    ];
    const weights = computeRoutingWeights(reserves);
    expect(sumWeights(weights)).toBe(BPS);
  });

  it("produces inverse-proportional weights (less idle → higher weight)", () => {
    const reserves: ChainReserve[] = [
      { chainSelector: 1n, idleUsdc: 100_000_000n }, // low idle
      { chainSelector: 2n, idleUsdc: 900_000_000n }, // high idle
    ];
    const weights = computeRoutingWeights(reserves);
    const w1 = weights.find((w) => w.chainSelector === 1n)!;
    const w2 = weights.find((w) => w.chainSelector === 2n)!;
    expect(w1.weightBps).toBeGreaterThan(w2.weightBps);
  });

  it("distributes equally when all reserves are zero", () => {
    const reserves: ChainReserve[] = [
      { chainSelector: 1n, idleUsdc: 0n },
      { chainSelector: 2n, idleUsdc: 0n },
      { chainSelector: 3n, idleUsdc: 0n },
    ];
    const weights = computeRoutingWeights(reserves);
    expect(sumWeights(weights)).toBe(BPS);
    expect(weights[0].weightBps).toBe(3333n);
    expect(weights[1].weightBps).toBe(3333n);
    // last chain absorbs remainder
    expect(weights[2].weightBps).toBe(BPS - 3333n - 3333n);
  });

  it("distributes equally when all chains have identical reserves", () => {
    const reserves: ChainReserve[] = [
      { chainSelector: 10n, idleUsdc: 5_000_000n },
      { chainSelector: 20n, idleUsdc: 5_000_000n },
    ];
    const weights = computeRoutingWeights(reserves);
    expect(sumWeights(weights)).toBe(BPS);
    expect(weights[0].weightBps).toBe(5_000n);
    expect(weights[1].weightBps).toBe(5_000n);
  });

  it("preserves chain selectors in output", () => {
    const reserves: ChainReserve[] = [
      { chainSelector: 16015286601757825753n, idleUsdc: 100n },
      { chainSelector: 14767482510784806043n, idleUsdc: 200n },
    ];
    const weights = computeRoutingWeights(reserves);
    expect(weights.map((w) => w.chainSelector)).toEqual([
      16015286601757825753n,
      14767482510784806043n,
    ]);
  });

  it("handles 5 chains and still sums to 10000 bps", () => {
    const reserves: ChainReserve[] = [
      { chainSelector: 1n, idleUsdc: 1n },
      { chainSelector: 2n, idleUsdc: 2n },
      { chainSelector: 3n, idleUsdc: 3n },
      { chainSelector: 4n, idleUsdc: 4n },
      { chainSelector: 5n, idleUsdc: 5n },
    ];
    const weights = computeRoutingWeights(reserves);
    expect(weights).toHaveLength(5);
    expect(sumWeights(weights)).toBe(BPS);
  });
});
