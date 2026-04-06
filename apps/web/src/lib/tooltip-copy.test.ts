import { describe, expect, it } from "vitest";
import { TOOLTIP_COPY, getTooltipCopy } from "./tooltip-copy";

describe("tooltip copy registry", () => {
  it("contains concise copy for key metric labels", () => {
    expect(getTooltipCopy("tvl")).toMatch(/total value locked/i);
    expect(getTooltipCopy("perpAllocated")).toMatch(/perp/i);
    expect(getTooltipCopy("tableAddress")).toMatch(/address/i);
  });

  it("has no empty entries", () => {
    for (const value of Object.values(TOOLTIP_COPY)) {
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });
});
