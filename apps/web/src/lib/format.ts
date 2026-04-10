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

function formatScaledUsd(value: bigint, scale: bigint, fractionDigits: number): string {
  const abs = value >= 0n ? value : -value;
  const pow10 = 10n ** BigInt(fractionDigits);
  const rounded = (abs * pow10 + (scale / 2n)) / scale;
  const whole = rounded / pow10;
  const frac = rounded % pow10;
  return `$${whole.toLocaleString()}.${frac.toString().padStart(fractionDigits, "0")}`;
}

export function formatUsd1e30(value: bigint, fractionDigits = 2): string {
  return formatScaledUsd(value, PRICE_PRECISION, fractionDigits);
}

export function formatSignedUsd1e30(value: bigint, fractionDigits = 2): string {
  if (value === 0n) return formatUsd1e30(0n, fractionDigits);
  const sign = value > 0n ? "+" : "-";
  return `${sign}${formatScaledUsd(value, PRICE_PRECISION, fractionDigits)}`;
}

export type ExposureDirection = "Long" | "Short" | "Flat";

export function formatNetExposure1e30(netSize: bigint, fractionDigits = 2): {
  direction: ExposureDirection;
  amount: string;
} {
  const direction: ExposureDirection = netSize > 0n ? "Long" : netSize < 0n ? "Short" : "Flat";
  const abs = netSize >= 0n ? netSize : -netSize;
  return {
    direction,
    amount: formatUsd1e30(abs, fractionDigits),
  };
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
    if (!hex || hex.length % 2 !== 0) return formatAddress(id);
    const bytes: number[] = [];
    for (let i = 0; i < hex.length; i += 2) {
      const b = parseInt(hex.slice(i, i + 2), 16);
      if (Number.isNaN(b)) return formatAddress(id);
      bytes.push(b);
    }
    const isPrintableAscii = bytes.every((b) => b >= 32 && b <= 126);
    if (isPrintableAscii) return String.fromCharCode(...bytes);

    return `${id.slice(0, 10)}...${id.slice(-8)}`;
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

export function parseTokenAmountInput(value: string, decimals: number): bigint | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!Number.isInteger(decimals) || decimals < 0) return undefined;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return undefined;

  const [wholePart, fracPart = ""] = trimmed.split(".");
  if (fracPart.length > decimals) return undefined;

  const whole = BigInt(wholePart || "0");
  const scale = 10n ** BigInt(decimals);
  if (decimals === 0) {
    return whole;
  }

  const frac = fracPart ? BigInt(fracPart.padEnd(decimals, "0")) : 0n;
  return whole * scale + frac;
}

export function formatTokenAmount(amount: bigint, decimals: number, maxFractionDigits = 4): string {
  if (!Number.isInteger(decimals) || decimals < 0) return amount.toString();

  const scale = 10n ** BigInt(decimals);
  const whole = amount / scale;
  if (decimals === 0) return whole.toLocaleString();

  const frac = amount % scale;
  const raw = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  if (raw.length === 0) return whole.toLocaleString();

  return `${whole.toLocaleString()}.${raw.slice(0, maxFractionDigits)}`;
}
