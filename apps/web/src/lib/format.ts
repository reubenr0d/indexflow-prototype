import { PRICE_PRECISION, USDC_PRECISION } from "./constants";

export function formatUSDC(amount: bigint): string {
  const whole = amount / USDC_PRECISION;
  const frac = amount % USDC_PRECISION;
  const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "");
  if (fracStr.length === 0) return formatCompact(Number(whole));
  return `${whole.toLocaleString()}.${fracStr.slice(0, 2)}`;
}

export function formatPrice(price: bigint): string {
  const usdValue = (price * USDC_PRECISION) / PRICE_PRECISION;
  return formatUSDC(usdValue);
}

export function formatPriceFull(price: bigint): string {
  const scaled = price * 100n / (PRICE_PRECISION / USDC_PRECISION);
  const whole = scaled / 100n;
  const frac = scaled % 100n;
  return `$${whole.toLocaleString()}.${frac.toString().padStart(2, "0")}`;
}

export function formatCompact(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toLocaleString()}`;
}

export function formatShares(shares: bigint): string {
  const whole = shares / 1_000_000n;
  const frac = shares % 1_000_000n;
  if (frac === 0n) return whole.toLocaleString();
  return `${whole.toLocaleString()}.${frac.toString().padStart(6, "0").slice(0, 4).replace(/0+$/, "")}`;
}

export function formatBps(bps: bigint | number): string {
  const val = typeof bps === "bigint" ? Number(bps) : bps;
  return `${(val / 100).toFixed(2)}%`;
}

export function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function formatAssetId(id: string): string {
  try {
    const hex = id.replace(/^0x/, "").replace(/00+$/, "");
    const bytes = [];
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.slice(i, i + 2), 16));
    }
    return String.fromCharCode(...bytes);
  } catch {
    return formatAddress(id);
  }
}

export function formatRelativeTime(timestamp: number): string {
  const diff = Math.floor(Date.now() / 1000) - timestamp;
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function parseUSDCInput(value: string): bigint {
  const parts = value.split(".");
  const whole = BigInt(parts[0] || "0") * USDC_PRECISION;
  if (parts.length === 1) return whole;
  const fracStr = (parts[1] || "").padEnd(6, "0").slice(0, 6);
  return whole + BigInt(fracStr);
}
