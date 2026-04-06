import { type Address } from "viem";

export type BasketListItem = {
  vault: Address;
  name: string;
  sharePrice: bigint;
  basketPrice: bigint;
  usdcBalance: bigint;
  perpAllocated: bigint;
  totalSupply: bigint;
  assetCount: number;
  depositFeeBps?: bigint;
  openInterest?: bigint;
  createdAt?: bigint;
  updatedAt?: bigint;
};

export type BasketListFilterKey = "hasPerp" | "noPerp" | "lowFee" | "highTvl";

export const LOW_FEE_THRESHOLD_BPS = 25n;
export const HIGH_TVL_RATIO_BPS = 7000n;

export function getBasketTvl(item: Pick<BasketListItem, "usdcBalance" | "perpAllocated">): bigint {
  return (item.usdcBalance ?? 0n) + (item.perpAllocated ?? 0n);
}

export function hasBasketPerp(item: Pick<BasketListItem, "perpAllocated" | "openInterest">): boolean {
  return (item.perpAllocated ?? 0n) > 0n || (item.openInterest ?? 0n) > 0n;
}

export function isLowFeeBasket(item: Pick<BasketListItem, "depositFeeBps">): boolean {
  const fee = item.depositFeeBps;
  return fee !== undefined && fee <= LOW_FEE_THRESHOLD_BPS;
}

export function getHighTvlThreshold(items: BasketListItem[]): bigint {
  if (items.length === 0) return 0n;
  const highestTvl = items.reduce((max, item) => {
    const tvl = getBasketTvl(item);
    return tvl > max ? tvl : max;
  }, 0n);
  return highestTvl > 0n ? (highestTvl * HIGH_TVL_RATIO_BPS) / 10_000n : 0n;
}

export function isHighTvlBasket(item: BasketListItem, threshold: bigint): boolean {
  if (threshold <= 0n) return getBasketTvl(item) > 0n;
  return getBasketTvl(item) >= threshold;
}

export function matchesBasketFilters(
  item: BasketListItem,
  filters: Set<BasketListFilterKey>,
  highTvlThreshold: bigint
): boolean {
  if (filters.size === 0) return true;
  if (filters.has("hasPerp") && !hasBasketPerp(item)) return false;
  if (filters.has("noPerp") && hasBasketPerp(item)) return false;
  if (filters.has("lowFee") && !isLowFeeBasket(item)) return false;
  if (filters.has("highTvl") && !isHighTvlBasket(item, highTvlThreshold)) return false;
  return true;
}

export function getBasketSortTimestamp(item: Pick<BasketListItem, "createdAt" | "updatedAt">): bigint {
  return item.updatedAt ?? item.createdAt ?? 0n;
}
