import { describe, expect, it } from "vitest";
import { parseBigInt, toBasketOverviewRows, toUserPortfolioRows } from "./transform";

describe("subgraph transform utilities", () => {
  it("parses bigints safely", () => {
    expect(parseBigInt("100")).toBe(100n);
    expect(parseBigInt(undefined)).toBe(0n);
    expect(parseBigInt("invalid")).toBe(0n);
  });

  it("normalizes basket overview rows", () => {
    const rows = toBasketOverviewRows([
      {
        id: "0x1111111111111111111111111111111111111111",
        name: "Metals",
        shareToken: "0x2222222222222222222222222222222222222222",
        assetCount: "2",
        basketPrice: "1000000000000000000000000000000",
        sharePrice: "1100000000000000000000000000000",
        usdcBalanceUsdc: "100000000",
        perpAllocatedUsdc: "25000000",
        tvlBookUsdc: "125000000",
        totalSupplyShares: "90000000",
        createdAt: "1",
        updatedAt: "2",
      },
    ]);

    expect(rows[0].name).toBe("Metals");
    expect(rows[0].tvlBookUsdc).toBe(125000000n);
    expect(rows[0].assetCount).toBe(2n);
  });

  it("normalizes user portfolio rows and computes total", () => {
    const result = toUserPortfolioRows([
      {
        id: "position-1",
        shareBalance: "5000000",
        netDepositedUsdc: "6000000",
        netRedeemedUsdc: "0",
        basket: {
          id: "0x1111111111111111111111111111111111111111",
          vault: "0x1111111111111111111111111111111111111111",
          name: "Metals",
          shareToken: "0x2222222222222222222222222222222222222222",
          sharePrice: "1000000000000000000000000000000",
          basketPrice: "1000000000000000000000000000000",
        },
      },
    ]);

    expect(result.holdings.length).toBe(1);
    expect(result.holdings[0].valueUsdc).toBe(5000000n);
    expect(result.totalValueUsdc).toBe(5000000n);
  });
});
