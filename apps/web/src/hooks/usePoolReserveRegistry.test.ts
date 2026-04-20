import { describe, expect, it, vi, type Mock } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DeploymentTarget } from "@/lib/deployment";
import {
  aggregateChainPoolStates,
  usePoolReserveRegistryState,
  type ChainState,
  type RawChainPoolStateResult,
} from "./usePoolReserveRegistry";
import { useMultiChainSubgraphQuery } from "./useMultiChainSubgraphQuery";

vi.mock("./useMultiChainSubgraphQuery", () => ({
  useMultiChainSubgraphQuery: vi.fn(),
}));

describe("usePoolReserveRegistryState", () => {
  it("aggregates chain pool states from multiple targets", () => {
    const rows = new Map<DeploymentTarget, RawChainPoolStateResult>([
      [
        "sepolia",
        {
          chainPoolStates: [
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
          ],
        },
      ],
      [
        "fuji",
        {
          chainPoolStates: [
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
          ],
        },
      ],
    ]);

    const out = aggregateChainPoolStates(rows);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.chainSelector.toString()).sort()).toEqual([
      "14767482510784806043",
      "16015286601757825753",
    ]);
  });

  it("returns explicit empty-state metadata when no rows exist", () => {
    const mocked = useMultiChainSubgraphQuery as Mock;
    mocked.mockReturnValue({
      data: [],
      isLoading: false,
      failedTargets: [],
    });

    let view: ReturnType<typeof usePoolReserveRegistryState> | null = null;
    function Probe() {
      view = usePoolReserveRegistryState();
      return createElement("div");
    }

    renderToStaticMarkup(createElement(Probe));
    expect(view).toEqual({
      chains: [],
      isLoading: false,
      isEmpty: true,
      failedTargets: [],
    });
  });

  it("returns partial data with failed targets metadata", () => {
    const mocked = useMultiChainSubgraphQuery as Mock;
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
    mocked.mockReturnValue({
      data: [chain],
      isLoading: false,
      failedTargets: ["fuji"],
    });

    let view: ReturnType<typeof usePoolReserveRegistryState> | null = null;
    function Probe() {
      view = usePoolReserveRegistryState();
      return createElement("div");
    }

    renderToStaticMarkup(createElement(Probe));
    expect(view).toEqual({
      chains: [chain],
      isLoading: false,
      isEmpty: false,
      failedTargets: ["fuji"],
    });
  });
});
