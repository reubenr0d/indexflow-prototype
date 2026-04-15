import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BasketCard } from "./basket-card";
import { PRICE_PRECISION } from "@/lib/constants";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));

describe("BasketCard", () => {
  it("renders the upgraded hierarchy and trend placeholders", () => {
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
        perpBlendBps: 2_500n,
      })
    );

    expect(html).toContain("Momentum Basket");
    expect(html).toContain("TVL");
    expect(html).toContain("Share price");
    expect(html).toContain("Assets");
    expect(html).toContain("Perp sleeve");
    expect(html).toContain("24h");
    expect(html).toContain("7d");
    expect(html).toContain("fee");
    expect(html).toContain("25.00%");
  });

  it("renders placeholder trend chips when trend data is unavailable", () => {
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
    expect(html).toContain("24h");
    expect(html).toContain("7d");
    expect(html).toContain("--");
  });
});
