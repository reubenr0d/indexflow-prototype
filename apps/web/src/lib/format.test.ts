import { describe, expect, it } from "vitest";
import { parseTokenAmountInput } from "./format";

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
