import { describe, expect, it } from "vitest";
import { computeApy, computeApy7dFromWeekSeries, formatApy } from "./apy";

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

describe("computeApy7dFromWeekSeries", () => {
  it("annualises from a daily anchor when no prior 7d bucket exists", () => {
    const current = {
      sharePrice: (PRICE_PRECISION * 1349n) / 1000n,
      bucketStart: 1_779_667_200n,
    };
    const apyAnchor = {
      sharePrice: PRICE_PRECISION,
      bucketStart: 1_779_235_200n,
    };
    const apy = computeApy7dFromWeekSeries({
      current,
      previous: null,
      apyAnchor,
    });
    expect(apy).not.toBeNull();
    expect((apy ?? 0) * 100).toBeCloseTo(2547.7, 0);
  });

  it("returns null when elapsed time is under one day", () => {
    const ts = 1_779_667_200n;
    expect(
      computeApy7dFromWeekSeries({
        current: { sharePrice: PRICE_PRECISION * 2n, bucketStart: ts },
        previous: null,
        apyAnchor: { sharePrice: PRICE_PRECISION, bucketStart: ts - 43_200n },
      }),
    ).toBeNull();
  });

  it("prefers apyAnchor over previous 7d bucket", () => {
    const current = { sharePrice: PRICE_PRECISION * 2n, bucketStart: 1_000_000n };
    const apyAnchor = { sharePrice: PRICE_PRECISION, bucketStart: 900_000n };
    const previous = { sharePrice: (PRICE_PRECISION * 15n) / 10n, bucketStart: 500_000n };
    const apy = computeApy7dFromWeekSeries({ current, previous, apyAnchor });
    const elapsedDays = Number(current.bucketStart - apyAnchor.bucketStart) / 86_400;
    const expected = (365 / elapsedDays) * 100;
    expect((apy ?? 0) * 100).toBeCloseTo(expected, 0);
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
