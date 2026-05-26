import { describe, expect, it } from "vitest";
import { oracleSymbolToYahooSymbol, YAHOO_SYMBOL_MAP } from "./yahoo-finance";

describe("oracleSymbolToYahooSymbol", () => {
  it("maps XAU to the COMEX gold future", () => {
    expect(oracleSymbolToYahooSymbol("XAU")).toBe("GC=F");
    expect(YAHOO_SYMBOL_MAP.XAU).toBe("GC=F");
  });

  it("maps XAG to the COMEX silver future", () => {
    expect(oracleSymbolToYahooSymbol("XAG")).toBe("SI=F");
    expect(YAHOO_SYMBOL_MAP.XAG).toBe("SI=F");
  });

  it("passes through suffixed exchange tickers unchanged", () => {
    expect(oracleSymbolToYahooSymbol("BHP.AX")).toBe("BHP.AX");
    expect(oracleSymbolToYahooSymbol("GLEN.L")).toBe("GLEN.L");
  });

  it("passes through plain US tickers unchanged", () => {
    expect(oracleSymbolToYahooSymbol("AAPL")).toBe("AAPL");
  });

  it("passes through crypto BASE-USD symbols", () => {
    expect(oracleSymbolToYahooSymbol("ETH-USD")).toBe("ETH-USD");
    expect(oracleSymbolToYahooSymbol("BTC-USD")).toBe("BTC-USD");
  });

  it("maps MATIC-USD to POL-USD on Yahoo", () => {
    expect(oracleSymbolToYahooSymbol("MATIC-USD")).toBe("POL-USD");
  });

  it("trims surrounding whitespace before mapping", () => {
    expect(oracleSymbolToYahooSymbol("  XAU  ")).toBe("GC=F");
    expect(oracleSymbolToYahooSymbol("  AAPL  ")).toBe("AAPL");
  });

  it("returns undefined for hex address-style placeholders", () => {
    expect(oracleSymbolToYahooSymbol("0xdeadbeef")).toBeUndefined();
    expect(oracleSymbolToYahooSymbol("0xDeAdBeEf")).toBeUndefined();
  });

  it("returns undefined for empty/missing values", () => {
    expect(oracleSymbolToYahooSymbol(undefined)).toBeUndefined();
    expect(oracleSymbolToYahooSymbol(null)).toBeUndefined();
    expect(oracleSymbolToYahooSymbol("")).toBeUndefined();
    expect(oracleSymbolToYahooSymbol("   ")).toBeUndefined();
  });
});
