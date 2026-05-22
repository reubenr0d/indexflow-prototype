import { describe, expect, it, vi, type Mock } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useQuery } from "@tanstack/react-query";
import {
  transformChainPoolStates,
  usePoolReserveRegistryState,
  type ChainState,
  type RawChainPoolState,
} from "./usePoolReserveRegistry";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}));

vi.mock("@/providers/DeploymentProvider", () => ({
  useDeploymentTarget: () => ({
    isSubgraphEnabled: true,
    subgraphUrl: "https://example.com/graphql",
  }),
}));

vi.mock("@/lib/subgraph/client", () => ({
  getSubgraphClient: () => ({ request: vi.fn() }),
}));

describe("transformChainPoolStates", () => {
  it("computes routing weights from twap pool amounts", () => {
    const raw: RawChainPoolState[] = [
      {
        id: "a",
        chainSelector: "16015286601757825753",
        twapPoolAmount: "1000000",
        availableLiquidity: "650000",
        reservedAmount: "350000",
        utilizationBps: "3500",
        snapshotTimestamp: "1700000000",
        snapshotCount: "1",
        updatedAt: "1700000000",
      },
      {
        id: "b",
        chainSelector: "14767482510784806043",
        twapPoolAmount: "3000000",
        availableLiquidity: "2700000",
        reservedAmount: "300000",
        utilizationBps: "1000",
        snapshotTimestamp: "1700000005",
        snapshotCount: "1",
        updatedAt: "1700000005",
      },
    ];

    const out = transformChainPoolStates(raw);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.chainSelector.toString()).sort()).toEqual([
      "14767482510784806043",
      "16015286601757825753",
    ]);
    // 1M / 4M = 2500 bps, 3M / 4M = 7500 bps
    const bySelector = new Map(out.map((r) => [r.chainSelector.toString(), r.routingWeight]));
    expect(bySelector.get("16015286601757825753")).toBe(2500);
    expect(bySelector.get("14767482510784806043")).toBe(7500);
  });
});

describe("usePoolReserveRegistryState", () => {
  it("returns explicit empty-state metadata when no rows exist", () => {
    const mocked = useQuery as unknown as Mock;
    mocked.mockReturnValue({ data: [], isLoading: false, isError: false });

    const viewRef: { current: ReturnType<typeof usePoolReserveRegistryState> | null } = { current: null };
    function Probe() {
      viewRef.current = usePoolReserveRegistryState();
      return createElement("div");
    }

    renderToStaticMarkup(createElement(Probe));
    expect(viewRef.current).toEqual({
      chains: [],
      isLoading: false,
      isEmpty: true,
      isError: false,
    });
  });

  it("surfaces an error flag when the indexer query fails", () => {
    const mocked = useQuery as unknown as Mock;
    const chain: ChainState = {
      chainSelector: 1n,
      poolDepth: 10n,
      reservedAmount: 2n,
      availableLiquidity: 8n,
      utilizationBps: 2000,
      routingWeight: 10000,
      staleness: 1,
      timestamp: 1700000000,
    };
    mocked.mockReturnValue({ data: [chain], isLoading: false, isError: true });

    const viewRef2: { current: ReturnType<typeof usePoolReserveRegistryState> | null } = { current: null };
    function Probe() {
      viewRef2.current = usePoolReserveRegistryState();
      return createElement("div");
    }

    renderToStaticMarkup(createElement(Probe));
    expect(viewRef2.current).toEqual({
      chains: [chain],
      isLoading: false,
      isEmpty: false,
      isError: true,
    });
  });
});
