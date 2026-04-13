import { describe, expect, it } from "vitest";
import { classifySymbolWithSearch } from "../../../shared/yahoo-symbol-policy.mjs";

describe("classifySymbolWithSearch", () => {
  it("rejects ambiguous unsuffixed equities", () => {
    const result = classifySymbolWithSearch("BHP", [
      { symbol: "BHP", quoteType: "EQUITY", exchange: "NYSE" },
      { symbol: "BHP.AX", quoteType: "EQUITY", exchange: "ASX" },
      { symbol: "BHP.L", quoteType: "EQUITY", exchange: "LSE" },
    ]);

    expect(result.allowed).toBe(false);
    expect(result.isAmbiguous).toBe(true);
    expect(result.candidates).toEqual(["BHP.AX", "BHP.L"]);
  });

  it("allows suffixed equities with exact resolution", () => {
    const result = classifySymbolWithSearch("BHP.AX", [
      { symbol: "BHP.AX", quoteType: "EQUITY", exchange: "ASX" },
      { symbol: "BHP", quoteType: "EQUITY", exchange: "NYSE" },
    ]);

    expect(result.allowed).toBe(true);
    expect(result.isAmbiguous).toBe(false);
    expect(result.reason).toBe("suffixed_symbol_exact_match");
  });

  it("allows unique unsuffixed equities", () => {
    const result = classifySymbolWithSearch("AAPL", [
      { symbol: "AAPL", quoteType: "EQUITY", exchange: "NASDAQ" },
    ]);

    expect(result.allowed).toBe(true);
    expect(result.isAmbiguous).toBe(false);
    expect(result.reason).toBe("unique_unsuffixed_equity");
  });

  it("allows non-equity symbols", () => {
    const xau = classifySymbolWithSearch("XAU", [
      { symbol: "XAU", quoteType: "CURRENCY", exchange: "CCY" },
    ]);
    const gcf = classifySymbolWithSearch("GC=F", []);

    expect(xau.allowed).toBe(true);
    expect(xau.isAmbiguous).toBe(false);
    expect(gcf.allowed).toBe(true);
    expect(gcf.isAmbiguous).toBe(false);
  });
});
