import { describe, expect, it } from "vitest";
import {
  filterHistoryWindow,
  getTxHref,
  historyChartPoints,
  sortAndDedupeHistory,
  type OraclePriceHistoryRow,
} from "./oracle-price-history";

const ASSET = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;

describe("oracle price history helpers", () => {
  it("dedupes by tx hash + log index and sorts newest first", () => {
    const rows: OraclePriceHistoryRow[] = [
      mkRow({ txHash: "0xbbb0000000000000000000000000000000000000000000000000000000000000", logIndex: 1n, priceTimestamp: 100n, blockNumber: 10n }),
      mkRow({ txHash: "0xaaa0000000000000000000000000000000000000000000000000000000000000", logIndex: 2n, priceTimestamp: 101n, blockNumber: 11n }),
      mkRow({ txHash: "0xbbb0000000000000000000000000000000000000000000000000000000000000", logIndex: 1n, priceTimestamp: 100n, blockNumber: 10n }),
    ];

    const sorted = sortAndDedupeHistory(rows);
    expect(sorted).toHaveLength(2);
    expect(sorted[0]?.priceTimestamp).toBe(101n);
    expect(sorted[1]?.priceTimestamp).toBe(100n);
  });

  it("filters rows by minimum timestamp", () => {
    const rows: OraclePriceHistoryRow[] = [
      mkRow({ txHash: "0xaaa0000000000000000000000000000000000000000000000000000000000000", logIndex: 1n, priceTimestamp: 100n }),
      mkRow({ txHash: "0xbbb0000000000000000000000000000000000000000000000000000000000000", logIndex: 2n, priceTimestamp: 120n }),
    ];

    const filtered = filterHistoryWindow(rows, 110n);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.priceTimestamp).toBe(120n);
  });

  it("maps chart points in ascending timestamp order", () => {
    const rows: OraclePriceHistoryRow[] = [
      mkRow({ txHash: "0xbbb0000000000000000000000000000000000000000000000000000000000000", logIndex: 2n, priceTimestamp: 120n, price: 2n * 10n ** 30n }),
      mkRow({ txHash: "0xaaa0000000000000000000000000000000000000000000000000000000000000", logIndex: 1n, priceTimestamp: 100n, price: 1n * 10n ** 30n }),
    ];

    const chart = historyChartPoints(rows);
    expect(chart[0]).toEqual({ timestamp: 100, priceUsd: 1 });
    expect(chart[1]).toEqual({ timestamp: 120, priceUsd: 2 });
  });

  it("builds explorer tx links only when base url exists", () => {
    const txHash = "0xaaa0000000000000000000000000000000000000000000000000000000000000" as const;
    expect(getTxHref("https://arbiscan.io", txHash)).toBe(`https://arbiscan.io/tx/${txHash}`);
    expect(getTxHref(undefined, txHash)).toBe("#");
  });
});

function mkRow(partial: Partial<OraclePriceHistoryRow>): OraclePriceHistoryRow {
  return {
    id: `${partial.txHash ?? "0x0"}-${partial.logIndex ?? 0n}`,
    assetId: ASSET,
    price: partial.price ?? 1n * 10n ** 30n,
    priceTimestamp: partial.priceTimestamp ?? 100n,
    blockNumber: partial.blockNumber ?? 10n,
    txHash: (partial.txHash ?? "0xccc0000000000000000000000000000000000000000000000000000000000000") as `0x${string}`,
    logIndex: partial.logIndex ?? 1n,
    createdAt: partial.createdAt ?? partial.priceTimestamp ?? 100n,
  };
}
