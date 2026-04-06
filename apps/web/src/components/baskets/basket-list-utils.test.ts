import { describe, expect, it } from "vitest";
import {
  getBasketSortTimestamp,
  getBasketTvl,
  getHighTvlThreshold,
  hasBasketPerp,
  isLowFeeBasket,
  matchesBasketFilters,
  type BasketListFilterKey,
} from "./basket-list-utils";

const baseItem = {
  vault: "0x0000000000000000000000000000000000000001" as const,
  name: "Alpha",
  sharePrice: 1n,
  basketPrice: 1n,
  usdcBalance: 100n,
  perpAllocated: 50n,
  totalSupply: 1n,
  assetCount: 2,
};

describe("basket list helpers", () => {
  it("computes basket TVL and perp presence", () => {
    expect(getBasketTvl(baseItem)).toBe(150n);
    expect(hasBasketPerp(baseItem)).toBe(true);
    expect(hasBasketPerp({ ...baseItem, perpAllocated: 0n, openInterest: 0n })).toBe(false);
  });

  it("identifies low-fee baskets using the configured threshold", () => {
    expect(isLowFeeBasket({ ...baseItem, depositFeeBps: 25n })).toBe(true);
    expect(isLowFeeBasket({ ...baseItem, depositFeeBps: 26n })).toBe(false);
    expect(isLowFeeBasket({ ...baseItem, depositFeeBps: undefined })).toBe(false);
  });

  it("derives a high-TVl threshold from the current basket set", () => {
    const items = [
      { ...baseItem, usdcBalance: 100n, perpAllocated: 0n },
      { ...baseItem, usdcBalance: 300n, perpAllocated: 100n },
    ];

    expect(getHighTvlThreshold(items)).toBe(280n);
  });

  it("filters rows by active quick filters", () => {
    const filters = new Set(["hasPerp", "highTvl"] as BasketListFilterKey[]);
    const rows = [
      { ...baseItem, usdcBalance: 100n, perpAllocated: 0n },
      { ...baseItem, usdcBalance: 400n, perpAllocated: 100n, depositFeeBps: 20n },
    ];

    expect(matchesBasketFilters(rows[0], filters, 300n)).toBe(false);
    expect(matchesBasketFilters(rows[1], filters, 300n)).toBe(true);
  });

  it("sorts by the freshest timestamp value", () => {
    expect(getBasketSortTimestamp({ ...baseItem, createdAt: 100n, updatedAt: 200n })).toBe(200n);
    expect(getBasketSortTimestamp({ ...baseItem, createdAt: 100n })).toBe(100n);
  });
});
