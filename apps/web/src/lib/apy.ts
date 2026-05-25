/**
 * Annualised return from share-price change over a measured window.
 * Uses simple (non-compounding) annualisation: rate * (365 / periodDays).
 */
export function computeApy(
  currentSharePrice: bigint,
  previousSharePrice: bigint,
  periodDays: number,
): number | null {
  if (previousSharePrice <= 0n || periodDays <= 0) return null;
  const rate =
    Number(currentSharePrice - previousSharePrice) /
    Number(previousSharePrice);
  return rate * (365 / periodDays);
}

export function formatApy(apy: number | null): string {
  if (apy === null) return "--";
  return `${apy >= 0 ? "+" : ""}${(apy * 100).toFixed(2)}%`;
}

type ApyTrendPoint = {
  sharePrice: bigint;
  bucketStart: bigint;
};

export type ApyWeekSeriesInput = {
  current: ApyTrendPoint | null;
  previous: ApyTrendPoint | null;
  apyAnchor?: ApyTrendPoint | null;
};

/** Annualise share-price change from `anchor` to `current` over the elapsed calendar days. */
export function computeApy7dFromTrendPoints(
  current: ApyTrendPoint | null | undefined,
  anchor: ApyTrendPoint | null | undefined,
): number | null {
  if (!current || !anchor) return null;
  const elapsedSec = Number(current.bucketStart - anchor.bucketStart);
  const elapsedDays = Math.max(elapsedSec / 86_400, 0);
  if (elapsedDays < 1) return null;
  return computeApy(current.sharePrice, anchor.sharePrice, elapsedDays);
}

/** APY (7d): prefer a daily snapshot ~7d before `current`, else the prior 7d bucket. */
export function computeApy7dFromWeekSeries(week: ApyWeekSeriesInput | null | undefined): number | null {
  const anchor = week?.apyAnchor ?? week?.previous ?? null;
  return computeApy7dFromTrendPoints(week?.current, anchor);
}
