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
