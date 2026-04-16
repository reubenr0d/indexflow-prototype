import { describe, it, expect } from "vitest";
import {
  computeGlobalNav,
  type ChainDeposits,
} from "../src/computeGlobalNav.js";

const USDC = (n: number) => BigInt(Math.round(n * 1e6));

describe("computeGlobalNav", () => {
  it("returns empty array for empty input", () => {
    expect(computeGlobalNav([], 0n, 0n)).toEqual([]);
  });

  it("hub always gets pnlAdjustment = 0", () => {
    const chains: ChainDeposits[] = [
      { chainSelector: 1n, idleUsdc: USDC(1000), isHub: true },
      { chainSelector: 2n, idleUsdc: USDC(1000), isHub: false },
    ];
    const result = computeGlobalNav(chains, USDC(500), USDC(100));
    const hub = result.find((r) => r.chainSelector === 1n)!;
    expect(hub.pnlAdjustment).toBe(0n);
  });

  it("distributes positive PnL proportionally to spokes", () => {
    const chains: ChainDeposits[] = [
      { chainSelector: 1n, idleUsdc: USDC(500), isHub: true },
      { chainSelector: 2n, idleUsdc: USDC(300), isHub: false },
      { chainSelector: 3n, idleUsdc: USDC(200), isHub: false },
    ];
    const hubPnL = USDC(100); // +100 USDC profit
    const result = computeGlobalNav(chains, USDC(400), hubPnL);

    const spoke2 = result.find((r) => r.chainSelector === 2n)!;
    const spoke3 = result.find((r) => r.chainSelector === 3n)!;

    // spoke2 share = 300/1000 * 100 = 30 USDC
    expect(spoke2.pnlAdjustment).toBe(USDC(30));
    // spoke3 share = 200/1000 * 100 = 20 USDC
    expect(spoke3.pnlAdjustment).toBe(USDC(20));
  });

  it("distributes negative PnL proportionally to spokes", () => {
    const chains: ChainDeposits[] = [
      { chainSelector: 1n, idleUsdc: USDC(600), isHub: true },
      { chainSelector: 2n, idleUsdc: USDC(400), isHub: false },
    ];
    const hubPnL = USDC(-50); // -50 USDC loss
    const result = computeGlobalNav(chains, USDC(300), hubPnL);

    const spoke = result.find((r) => r.chainSelector === 2n)!;
    // spoke share = 400/1000 * (-50) = -20 USDC
    expect(spoke.pnlAdjustment).toBe(USDC(-20));
  });

  it("returns zero adjustments when hubPnL is zero", () => {
    const chains: ChainDeposits[] = [
      { chainSelector: 1n, idleUsdc: USDC(500), isHub: true },
      { chainSelector: 2n, idleUsdc: USDC(500), isHub: false },
    ];
    const result = computeGlobalNav(chains, USDC(200), 0n);

    for (const adj of result) {
      expect(adj.pnlAdjustment).toBe(0n);
    }
  });

  it("handles single spoke (gets full share of PnL)", () => {
    const chains: ChainDeposits[] = [
      { chainSelector: 1n, idleUsdc: USDC(1000), isHub: true },
      { chainSelector: 2n, idleUsdc: USDC(1000), isHub: false },
    ];
    const hubPnL = USDC(200);
    const result = computeGlobalNav(chains, USDC(500), hubPnL);

    const spoke = result.find((r) => r.chainSelector === 2n)!;
    // spoke share = 1000/2000 * 200 = 100 USDC
    expect(spoke.pnlAdjustment).toBe(USDC(100));
  });

  it("returns zero adjustments when total deposits are zero", () => {
    const chains: ChainDeposits[] = [
      { chainSelector: 1n, idleUsdc: 0n, isHub: true },
      { chainSelector: 2n, idleUsdc: 0n, isHub: false },
    ];
    const result = computeGlobalNav(chains, 0n, USDC(100));

    for (const adj of result) {
      expect(adj.pnlAdjustment).toBe(0n);
    }
  });

  it("handles hub-only setup (no spokes)", () => {
    const chains: ChainDeposits[] = [
      { chainSelector: 1n, idleUsdc: USDC(5000), isHub: true },
    ];
    const result = computeGlobalNav(chains, USDC(2000), USDC(300));
    expect(result).toHaveLength(1);
    expect(result[0].pnlAdjustment).toBe(0n);
  });

  it("preserves chain selectors in output", () => {
    const chains: ChainDeposits[] = [
      { chainSelector: 16015286601757825753n, idleUsdc: USDC(100), isHub: true },
      { chainSelector: 14767482510784806043n, idleUsdc: USDC(100), isHub: false },
    ];
    const result = computeGlobalNav(chains, 0n, 0n);
    expect(result.map((r) => r.chainSelector)).toEqual([
      16015286601757825753n,
      14767482510784806043n,
    ]);
  });
});
