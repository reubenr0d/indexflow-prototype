import { describe, expect, it } from "vitest";
import { formatNetExposure1e30, formatSignedUsd1e30, formatUsd1e30, parseTokenAmountInput } from "./format";

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
