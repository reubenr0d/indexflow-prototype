import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PerpCompositionRow, getLongShortPercents } from "./perp-composition-row";

describe("getLongShortPercents", () => {
  it("splits long/short totals into percentages", () => {
    expect(getLongShortPercents(3n, 1n)).toEqual({ longPct: 75, shortPct: 25 });
    expect(getLongShortPercents(1n, 3n)).toEqual({ longPct: 25, shortPct: 75 });
  });

  it("handles zero totals", () => {
    expect(getLongShortPercents(0n, 0n)).toEqual({ longPct: 0, shortPct: 0 });
  });
});

describe("PerpCompositionRow", () => {
  const ONE = 10n ** 30n;

  it("renders net direction, long/short values, and allocation", () => {
    const html = renderToStaticMarkup(
      createElement(PerpCompositionRow, {
        assetName: "ETH",
        assetAddressLabel: "0x1234...cdef",
        netSize1e30: 2n * ONE,
        longSize1e30: 3n * ONE,
        shortSize1e30: 1n * ONE,
        blendBps: 2_500n,
      })
    );

    expect(html).toContain("Net $2.00");
    expect(html).toContain("Long $3.00");
    expect(html).toContain("Short $1.00");
    expect(html).toContain("25.00%");
    expect(html).toContain("width:37.5%");
    expect(html).toContain("width:12.5%");
  });
});
