import { type Address } from "viem";

export function parseBigInt(value: string | null | undefined): bigint {
  if (!value) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

export function toBasketOverviewRows(rows: Array<Record<string, string>>) {
  return rows.map((b) => ({
    vault: b.id as Address,
    name: b.name ?? "",
    shareToken: b.shareToken as Address,
    assetCount: parseBigInt(b.assetCount),
    basketPrice: parseBigInt(b.basketPrice),
    sharePrice: parseBigInt(b.sharePrice),
    usdcBalance: parseBigInt(b.usdcBalanceUsdc),
    perpAllocated: parseBigInt(b.perpAllocatedUsdc),
    tvlBookUsdc: parseBigInt(b.tvlBookUsdc),
    totalSupply: parseBigInt(b.totalSupplyShares),
    createdAt: parseBigInt(b.createdAt),
    updatedAt: parseBigInt(b.updatedAt),
  }));
}

export function toUserPortfolioRows(rows: Array<Record<string, unknown>>) {
  const holdings = rows.map((p) => {
    const basket = p.basket as Record<string, string>;
    const shareBalance = parseBigInt(String(p.shareBalance ?? "0"));
    const sharePrice = parseBigInt(basket.sharePrice);
    return {
      id: String(p.id),
      vault: (basket.vault ?? basket.id) as Address,
      name: basket.name ?? "",
      shareToken: basket.shareToken as Address,
      sharePrice,
      basketPrice: parseBigInt(basket.basketPrice),
      shareBalance,
      valueUsdc: (shareBalance * sharePrice) / 10n ** 30n,
      netDepositedUsdc: parseBigInt(String(p.netDepositedUsdc ?? "0")),
      netRedeemedUsdc: parseBigInt(String(p.netRedeemedUsdc ?? "0")),
    };
  });

  return {
    holdings,
    totalValueUsdc: holdings.reduce((sum, h) => sum + h.valueUsdc, 0n),
  };
}
