import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeRoutingWeights } from "../src/computeRoutingWeights.js";
import { computeGlobalNav } from "../src/computeGlobalNav.js";

/**
 * Integration test that simulates a full keeper epoch against 3 mock chains.
 *
 * Instead of importing the index.ts entry point (which has side effects and
 * requires live RPC), we replicate the epoch data flow using the pure
 * computation functions and verify that the assembled calldata is correct.
 */

const USDC = (n: number) => BigInt(Math.round(n * 1e6));

interface MockChain {
  name: string;
  chainSelector: bigint;
  role: "hub" | "spoke";
  vaults: string[];
  idleUsdc: bigint;
  perpAllocated: bigint;
  hubPnL: { unrealised: bigint; realised: bigint } | null;
}

function buildMockChains(): MockChain[] {
  return [
    {
      name: "sepolia",
      chainSelector: 16015286601757825753n,
      role: "hub",
      vaults: ["0xHubVault1", "0xHubVault2"],
      idleUsdc: USDC(5000),
      perpAllocated: USDC(2000),
      hubPnL: { unrealised: USDC(150), realised: USDC(50) },
    },
    {
      name: "fuji",
      chainSelector: 14767482510784806043n,
      role: "spoke",
      vaults: ["0xFujiVault1"],
      idleUsdc: USDC(3000),
      perpAllocated: 0n,
      hubPnL: null,
    },
    {
      name: "arb_sepolia",
      chainSelector: 3478487238524512106n,
      role: "spoke",
      vaults: ["0xArbVault1", "0xArbVault2", "0xArbVault3"],
      idleUsdc: USDC(2000),
      perpAllocated: 0n,
      hubPnL: null,
    },
  ];
}

function simulateEpoch(mockChains: MockChain[]) {
  const chainReserves = mockChains.map((c) => ({
    chainSelector: c.chainSelector,
    idleUsdc: c.idleUsdc,
  }));
  const routingWeights = computeRoutingWeights(chainReserves);

  const hub = mockChains.find((c) => c.role === "hub")!;
  const hubPnLTotal = hub.hubPnL
    ? hub.hubPnL.unrealised + hub.hubPnL.realised
    : 0n;

  const chainDeposits = mockChains.map((c) => ({
    chainSelector: c.chainSelector,
    idleUsdc: c.idleUsdc,
    isHub: c.role === "hub",
  }));
  const pnlAdjustments = computeGlobalNav(
    chainDeposits,
    hub.perpAllocated,
    hubPnLTotal,
  );

  const chains = routingWeights.map((w) => w.chainSelector);
  const weights = routingWeights.map((w) => w.weightBps);
  const ts = Math.floor(Date.now() / 1000);

  const allVaults: string[] = [];
  const allPnl: bigint[] = [];

  for (const mc of mockChains) {
    const chainAdj = pnlAdjustments.find(
      (a) => a.chainSelector === mc.chainSelector,
    );
    const adj = chainAdj?.pnlAdjustment ?? 0n;
    for (const vault of mc.vaults) {
      allVaults.push(vault);
      allPnl.push(adj);
    }
  }

  return { chains, weights, allVaults, allPnl, ts, routingWeights, pnlAdjustments };
}

describe("integration: full epoch simulation", () => {
  let mockChains: MockChain[];

  beforeEach(() => {
    mockChains = buildMockChains();
  });

  it("produces calldata arrays with correct lengths", () => {
    const result = simulateEpoch(mockChains);
    expect(result.chains).toHaveLength(3);
    expect(result.weights).toHaveLength(3);
    // total vaults: 2 + 1 + 3 = 6
    expect(result.allVaults).toHaveLength(6);
    expect(result.allPnl).toHaveLength(6);
  });

  it("routing weights sum to 10000 bps", () => {
    const result = simulateEpoch(mockChains);
    const total = result.weights.reduce((s, w) => s + w, 0n);
    expect(total).toBe(10_000n);
  });

  it("hub vaults get pnlAdjustment = 0", () => {
    const result = simulateEpoch(mockChains);
    // Hub vaults are the first 2 entries
    expect(result.allPnl[0]).toBe(0n);
    expect(result.allPnl[1]).toBe(0n);
  });

  it("spoke vaults get proportional PnL adjustments", () => {
    const result = simulateEpoch(mockChains);
    const totalDeposits = USDC(5000) + USDC(3000) + USDC(2000);
    const hubPnL = USDC(150) + USDC(50); // 200 USDC

    // Fuji: 3000/10000 * 200 = 60 USDC
    const fujiAdj = (USDC(3000) * hubPnL) / totalDeposits;
    expect(result.allPnl[2]).toBe(fujiAdj); // fuji vault

    // Arb: 2000/10000 * 200 = 40 USDC
    const arbAdj = (USDC(2000) * hubPnL) / totalDeposits;
    expect(result.allPnl[3]).toBe(arbAdj); // arb vault 1
    expect(result.allPnl[4]).toBe(arbAdj); // arb vault 2
    expect(result.allPnl[5]).toBe(arbAdj); // arb vault 3
  });

  it("chain with least idle gets highest routing weight", () => {
    const result = simulateEpoch(mockChains);
    // arb_sepolia has 2000 USDC (least), should have highest weight
    const arbWeight = result.routingWeights.find(
      (w) => w.chainSelector === 3478487238524512106n,
    )!;
    const hubWeight = result.routingWeights.find(
      (w) => w.chainSelector === 16015286601757825753n,
    )!;
    expect(arbWeight.weightBps).toBeGreaterThan(hubWeight.weightBps);
  });

  it("timestamp is a recent unix epoch", () => {
    const result = simulateEpoch(mockChains);
    const now = Math.floor(Date.now() / 1000);
    expect(result.ts).toBeGreaterThanOrEqual(now - 2);
    expect(result.ts).toBeLessThanOrEqual(now + 1);
  });

  it("works with a single chain", () => {
    const singleChain = [mockChains[0]];
    const result = simulateEpoch(singleChain);
    expect(result.chains).toHaveLength(1);
    expect(result.weights).toEqual([10_000n]);
    expect(result.allVaults).toHaveLength(2);
    expect(result.allPnl.every((p) => p === 0n)).toBe(true);
  });
});
