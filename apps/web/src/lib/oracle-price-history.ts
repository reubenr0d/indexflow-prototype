import { PRICE_PRECISION, USDC_PRECISION } from "@/lib/constants";

export type PriceHistoryWindow = "24H" | "7D" | "30D";

export const PRICE_HISTORY_WINDOW_SECONDS: Record<PriceHistoryWindow, bigint> = {
  "24H": 24n * 60n * 60n,
  "7D": 7n * 24n * 60n * 60n,
  "30D": 30n * 24n * 60n * 60n,
};

export type OraclePriceHistoryRow = {
  id: string;
  assetId: `0x${string}`;
  price: bigint;
  priceTimestamp: bigint;
  blockNumber: bigint;
  txHash: `0x${string}`;
  logIndex: bigint;
  createdAt: bigint;
};

export function sortAndDedupeHistory(rows: OraclePriceHistoryRow[]): OraclePriceHistoryRow[] {
  const deduped = new Map<string, OraclePriceHistoryRow>();
  for (const row of rows) {
    const key = `${row.txHash}-${row.logIndex.toString()}`;
    if (!deduped.has(key)) {
      deduped.set(key, row);
    }
  }

  return Array.from(deduped.values()).sort((a, b) => {
    if (a.priceTimestamp === b.priceTimestamp) {
      if (a.blockNumber === b.blockNumber) {
        return Number(b.logIndex - a.logIndex);
      }
      return Number(b.blockNumber - a.blockNumber);
    }
    return Number(b.priceTimestamp - a.priceTimestamp);
  });
}

export function filterHistoryWindow(rows: OraclePriceHistoryRow[], minTimestamp: bigint): OraclePriceHistoryRow[] {
  return rows.filter((row) => row.priceTimestamp >= minTimestamp);
}

export function historyChartPoints(rows: OraclePriceHistoryRow[]): Array<{ timestamp: number; priceUsd: number }> {
  return rows
    .slice()
    .sort((a, b) => Number(a.priceTimestamp - b.priceTimestamp))
    .map((row) => ({
      timestamp: Number(row.priceTimestamp),
      priceUsd: price1e30ToUsdNumber(row.price),
    }));
}

export function getTxHref(explorerBase: string | undefined, txHash: `0x${string}`): string {
  if (!explorerBase) return "#";
  return `${explorerBase}/tx/${txHash}`;
}

function price1e30ToUsdNumber(price: bigint): number {
  const usdcAtoms = (price * USDC_PRECISION) / PRICE_PRECISION;
  return Number(usdcAtoms) / Number(USDC_PRECISION);
}
