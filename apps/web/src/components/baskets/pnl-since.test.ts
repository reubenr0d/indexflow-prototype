import { describe, expect, it } from "vitest";
import { formatPnlSinceSubtext } from "./pnl-since";

describe("formatPnlSinceSubtext", () => {
  it("formats a short absolute date when createdAt is available", () => {
    expect(formatPnlSinceSubtext(1736640000n)).toBe("Since Jan 12, 2025");
  });

  it("returns undefined when createdAt is missing or zero", () => {
    expect(formatPnlSinceSubtext()).toBeUndefined();
    expect(formatPnlSinceSubtext(0n)).toBeUndefined();
  });
});
