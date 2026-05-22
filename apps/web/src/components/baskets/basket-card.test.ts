import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BasketCard } from "./basket-card";
import { PRICE_PRECISION } from "@/lib/constants";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));

vi.mock("@/hooks/useAgentMetadata", () => ({
  useAgentMetadata: () => ({ data: null, isPending: false, isError: false }),
}));

vi.mock("@/hooks/subgraph/useBasketTrends", () => ({
  useBasketTrendSnapshots: () => ({ data: undefined, isPending: false, isError: false }),
}));

describe("BasketCard", () => {
  it("renders PnL, Assets, and the composition bar", () => {
    const html = renderToStaticMarkup(
      createElement(BasketCard, {
        vault: "0x0000000000000000000000000000000000000002",
        name: "Momentum Basket",
        sharePrice: PRICE_PRECISION * 125n / 100n,
        basketPrice: PRICE_PRECISION * 125n / 100n,
        usdcBalance: 500_000_000n,
        perpAllocated: 250_000_000n,
        totalSupply: 1_000_000n,
        assetCount: 4,
        depositFee: 25n,
      })
    );

    expect(html).toContain("Momentum Basket");
    expect(html).toContain("TVL");
    expect(html).toContain("PnL");
    expect(html).toContain("+25.00%");
    expect(html).toContain("Assets");
    expect(html).toContain(">4<");
    expect(html).toContain("Composition");
    expect(html).toContain("% idle");
    expect(html).toContain("% allocated");
    expect(html).not.toContain("Share price");
    expect(html).not.toContain("Perp exposure");
    expect(html).toContain("24h");
    expect(html).toContain("7d");
    expect(html).toContain("fee");
    expect(html).toContain("25.00%");
  });

  it("renders zero PnL and asset count when share price equals inception", () => {
    const html = renderToStaticMarkup(
      createElement(BasketCard, {
        vault: "0x0000000000000000000000000000000000000003",
        name: "Defensive Basket",
        sharePrice: PRICE_PRECISION,
        basketPrice: PRICE_PRECISION,
        usdcBalance: 100_000_000n,
        perpAllocated: 0n,
        totalSupply: 1_000_000n,
        assetCount: 2,
      })
    );

    expect(html).toContain("Fee --");
    expect(html).toContain("PnL");
    expect(html).toContain("0.00%");
    expect(html).not.toContain("+0.00%");
    expect(html).not.toContain("-0.00%");
    expect(html).toContain(">2<");
    expect(html).toContain("Composition");
    expect(html).toContain("100% idle");
    expect(html).toContain("0% allocated");
    expect(html).toContain("24h");
    expect(html).toContain("7d");
    expect(html).toContain("--");
  });
});
