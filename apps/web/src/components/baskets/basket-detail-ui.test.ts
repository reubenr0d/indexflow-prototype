import { describe, expect, it } from "vitest";
import {
  formatHistoryLabel,
  getBasketActivityMeta,
  groupHistoryRowsByDay,
  type BasketHistoryRow,
} from "./basket-detail-ui";

const ROWS: BasketHistoryRow[] = [
  {
    id: "2",
    activityType: "redeem",
    timestamp: 1_700_086_400n,
    txHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
    amountUsdc: 25_000_000n,
  },
  {
    id: "1",
    activityType: "deposit",
    timestamp: 1_700_083_000n,
    txHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
    amountUsdc: 100_000_000n,
  },
  {
    id: "3",
    activityType: "positionOpened",
    timestamp: 1_700_000_000n,
    txHash: "0x3333333333333333333333333333333333333333333333333333333333333333",
    assetId: "0x4554480000000000000000000000000000000000000000000000000000000000",
    isLong: true,
    size: 4_000_000_000_000_000_000_000_000_000_000_000_000n,
    amountUsdc: 2_500_000n,
  },
];

describe("basket-detail-ui helpers", () => {
  it("groups history rows by local day bucket", () => {
    const groups = groupHistoryRowsByDay(ROWS);

    expect(groups).toHaveLength(2);
    expect(groups[0].rows).toHaveLength(2);
    expect(groups[0].rows[0].id).toBe("2");
    expect(groups[0].rows[1].id).toBe("1");
    expect(groups[1].rows).toHaveLength(1);
  });

  it("formats humanized activity labels", () => {
    expect(formatHistoryLabel(ROWS[0])).toContain("Redeemed");
    expect(formatHistoryLabel(ROWS[1])).toContain("Deposited");
    expect(formatHistoryLabel(ROWS[2])).toContain("Opened long position");
  });

  it("maps activity metadata to an icon/title pair", () => {
    const meta = getBasketActivityMeta(ROWS[2]);

    expect(meta.title).toBe("Opened long position");
    expect(meta.detail).toContain("ETH");
    expect(meta.detail).toContain("collateral");
    expect(meta.icon).toBeDefined();
  });
});
