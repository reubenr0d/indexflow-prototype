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

  it("allows bare US tickers when foreign siblings are unrelated companies", () => {
    const result = classifySymbolWithSearch("CRML", [
      { symbol: "CRML", quoteType: "EQUITY", exchange: "NASDAQ", name: "Critical Metals Corp." },
      { symbol: "CRML.TA", quoteType: "EQUITY", exchange: "Tel Aviv", name: "Carmel Corp Ltd." },
    ]);

    expect(result.allowed).toBe(true);
    expect(result.isAmbiguous).toBe(false);
    expect(result.reason).toBe("us_listing_with_unrelated_siblings");
    expect(result.resolvedSymbol).toBe("CRML");
    expect(result.exchange).toBe("NASDAQ");
  });

  it("still rejects bare US tickers when foreign siblings are the same company (ADR/home pair)", () => {
    const result = classifySymbolWithSearch("BHP", [
      { symbol: "BHP", quoteType: "EQUITY", exchange: "NYSE", name: "BHP Group Limited" },
      { symbol: "BHP.AX", quoteType: "EQUITY", exchange: "ASX", name: "BHP Group Limited" },
    ]);

    expect(result.allowed).toBe(false);
    expect(result.isAmbiguous).toBe(true);
    expect(result.reason).toBe("ambiguous_unsuffixed_equity");
    expect(result.candidates).toEqual(["BHP.AX"]);
  });
});
