import { describe, expect, it } from "vitest";
import {
  formatLeverageRatio,
  formatNetExposure1e30,
  formatSignedUsd1e30,
  formatSignedUsdcAmount,
  formatUsd1e30,
  formatUsdcAmount,
  formatVaultDisplayName,
  parseTokenAmountInput,
} from "./format";

describe("parseTokenAmountInput", () => {
  it("parses 6-decimal human input", () => {
    expect(parseTokenAmountInput("1.5", 6)).toBe(1_500_000n);
    expect(parseTokenAmountInput("0.000001", 6)).toBe(1n);
  });

  it("parses 18-decimal human input", () => {
    expect(parseTokenAmountInput("1", 18)).toBe(1_000_000_000_000_000_000n);
    expect(parseTokenAmountInput("0.000000000000000001", 18)).toBe(1n);
  });

  it("parses 0-decimal tokens", () => {
    expect(parseTokenAmountInput("42", 0)).toBe(42n);
  });

  it("rejects invalid and over-precision input", () => {
    expect(parseTokenAmountInput("", 6)).toBeUndefined();
    expect(parseTokenAmountInput("abc", 6)).toBeUndefined();
    expect(parseTokenAmountInput("1.0000001", 6)).toBeUndefined();
    expect(parseTokenAmountInput("1.0", 0)).toBeUndefined();
  });
});

describe("formatUsd1e30", () => {
  const PRICE_PRECISION = 10n ** 30n;

  it("formats full USD values from 1e30-scaled notionals", () => {
    expect(formatUsd1e30(0n)).toBe("$0.00");
    expect(formatUsd1e30(1n * PRICE_PRECISION)).toBe("$1.00");
    expect(formatUsd1e30(1_234_567n * PRICE_PRECISION)).toBe("$1,234,567.00");
    expect(formatUsd1e30(123_456n * (PRICE_PRECISION / 100n))).toBe("$1,234.56");
  });

  it("formats signed notionals and net direction helpers", () => {
    expect(formatSignedUsd1e30(0n)).toBe("$0.00");
    expect(formatSignedUsd1e30(2n * PRICE_PRECISION)).toBe("+$2.00");
    expect(formatSignedUsd1e30(-2n * PRICE_PRECISION)).toBe("-$2.00");

    expect(formatNetExposure1e30(5n * PRICE_PRECISION)).toEqual({
      direction: "Long",
      amount: "$5.00",
    });
    expect(formatNetExposure1e30(-7n * PRICE_PRECISION)).toEqual({
      direction: "Short",
      amount: "$7.00",
    });
    expect(formatNetExposure1e30(0n)).toEqual({
      direction: "Flat",
      amount: "$0.00",
    });
  });
});

describe("formatLeverageRatio", () => {
  const PRICE_PRECISION = 10n ** 30n;
  const USDC_PRECISION = 10n ** 6n;

  it("returns -- when deposited capital is zero", () => {
    expect(formatLeverageRatio(PRICE_PRECISION, 0n)).toBe("--");
  });

  it("formats 1:1 open interest to deposited capital", () => {
    expect(formatLeverageRatio(PRICE_PRECISION, USDC_PRECISION)).toBe("1x");
  });

  it("formats fractional leverage with trimmed trailing zeros", () => {
    expect(formatLeverageRatio((25n * PRICE_PRECISION) / 10n, USDC_PRECISION)).toBe("2.5x");
    expect(formatLeverageRatio((201n * PRICE_PRECISION) / 100n, USDC_PRECISION)).toBe("2.01x");
  });

  it("returns 0x when open interest is zero", () => {
    expect(formatLeverageRatio(0n, USDC_PRECISION)).toBe("0x");
  });
});

describe("formatVaultDisplayName", () => {
  it("strips Minestarters prefix from agent vault names", () => {
    expect(formatVaultDisplayName("Minestarters ML Picks")).toBe("ML Picks");
    expect(formatVaultDisplayName("Minestarters Quality Matrix")).toBe("Quality Matrix");
  });

  it("is case-insensitive and trims surrounding whitespace", () => {
    expect(formatVaultDisplayName("minestarters ML Picks")).toBe("ML Picks");
    expect(formatVaultDisplayName("  Minestarters   ML Picks  ")).toBe("ML Picks");
  });

  it("leaves unrelated vault names unchanged", () => {
    expect(formatVaultDisplayName("Metals Basket")).toBe("Metals Basket");
    expect(formatVaultDisplayName("")).toBe("");
  });
});

describe("formatUsdcAmount / formatSignedUsdcAmount", () => {
  it("formats full USD values from USDC 6-decimal amounts", () => {
    expect(formatUsdcAmount(0n)).toBe("$0.00");
    expect(formatUsdcAmount(1_000_000n)).toBe("$1.00");
    expect(formatUsdcAmount(1_234_560_000n)).toBe("$1,234.56");
    expect(formatUsdcAmount(1_234_567n * 1_000_000n)).toBe("$1,234,567.00");
  });

  it("formats signed USDC 6-decimal amounts with + / - prefix", () => {
    expect(formatSignedUsdcAmount(0n)).toBe("$0.00");
    expect(formatSignedUsdcAmount(2_000_000n)).toBe("+$2.00");
    expect(formatSignedUsdcAmount(-2_000_000n)).toBe("-$2.00");
    expect(formatSignedUsdcAmount(1_234_560_000n)).toBe("+$1,234.56");
    expect(formatSignedUsdcAmount(-1_234_560_000n)).toBe("-$1,234.56");
  });

  it("formats vault realised PnL from BasketActivity (USDC 6-dec, not 1e30)", () => {
    expect(formatSignedUsdcAmount(945_278_838n)).toBe("+$945.28");
    expect(formatSignedUsdcAmount(876_495_507n)).toBe("+$876.50");
    expect(formatSignedUsdcAmount(-152_540n)).toBe("-$0.15");
  });
});
