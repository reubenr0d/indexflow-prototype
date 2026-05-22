import { describe, expect, it, vi, type Mock } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ChainsPage from "./page";
import { usePoolReserveRegistryState } from "@/hooks/usePoolReserveRegistry";

vi.mock("@/components/layout/page-wrapper", () => ({
  PageWrapper: ({ children }: { children: React.ReactNode }) =>
    createElement("div", { "data-testid": "page-wrapper" }, children),
}));

vi.mock("@/components/chains/chain-visualizations", () => ({
  ChainDistributionChart: ({ chains }: { chains: Array<{ chainSelector: bigint }> }) =>
    createElement(
      "div",
      { "data-testid": "chain-chart" },
      `chart:${chains.map((c) => c.chainSelector.toString()).join(",")}`,
    ),
}));

vi.mock("@/hooks/usePoolReserveRegistry", () => ({
  usePoolReserveRegistryState: vi.fn(),
}));

describe("/chains page", () => {
  it("shows explicit empty state and no placeholder copy", () => {
    (usePoolReserveRegistryState as Mock).mockReturnValue({
      chains: [],
      isLoading: false,
      isEmpty: true,
      isError: false,
    });

    const html = renderToStaticMarkup(createElement(ChainsPage));
    expect(html).toContain("No relay state indexed yet");
    expect(html).toContain("Weight sum");
    expect(html).not.toContain("Showing placeholder registry data");
  });

  it("surfaces an indexer error banner and still renders chart with available chains", () => {
    (usePoolReserveRegistryState as Mock).mockReturnValue({
      chains: [
        {
          chainSelector: 111n,
          poolDepth: 100n,
          reservedAmount: 20n,
          availableLiquidity: 80n,
          utilizationBps: 2000,
          routingWeight: 10000,
          staleness: 1,
          timestamp: 1700000000,
        },
      ],
      isLoading: false,
      isEmpty: false,
      isError: true,
    });

    const html = renderToStaticMarkup(createElement(ChainsPage));
    expect(html).toContain("Could not reach the indexer.");
    expect(html).toContain("data-testid=\"chain-chart\"");
    expect(html).toContain("chart:111");
    expect(html).toContain("Stale chains (&gt;5m)");
  });
});
