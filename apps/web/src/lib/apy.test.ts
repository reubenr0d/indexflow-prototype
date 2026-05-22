import { describe, expect, it } from "vitest";
import { computeApy, formatApy } from "./apy";

const PRICE_PRECISION = 10n ** 30n;

describe("computeApy", () => {
  it("annualises a 7-day +1% gain to ~+52.14%", () => {
    const apy = computeApy(
      (PRICE_PRECISION * 101n) / 100n,
      PRICE_PRECISION,
      7,
    );
    expect(apy).not.toBeNull();
    expect((apy ?? 0) * 100).toBeCloseTo(52.14, 1);
  });

  it("returns null for a non-positive previous share price", () => {
    expect(computeApy(PRICE_PRECISION, 0n, 7)).toBeNull();
  });

  it("returns null for a non-positive period", () => {
    expect(computeApy(PRICE_PRECISION, PRICE_PRECISION, 0)).toBeNull();
  });
});

describe("formatApy", () => {
  it("renders a '+' sign for non-negative values and a fixed two-decimal percentage", () => {
    expect(formatApy(0.5214)).toBe("+52.14%");
    expect(formatApy(0)).toBe("+0.00%");
  });

  it("renders negative values without an extra '+'", () => {
    expect(formatApy(-0.123)).toBe("-12.30%");
  });

  it("renders -- when the value is null (uncomputable)", () => {
    expect(formatApy(null)).toBe("--");
  });
});
