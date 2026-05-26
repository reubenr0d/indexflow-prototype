import assert from "node:assert/strict";
import test from "node:test";

import {
  bybitLinearPerpTradeUrl,
  resolveMarketOutlink,
  yahooFinanceQuoteUrl,
} from "./market-outlinks.mjs";

test("yahooFinanceQuoteUrl encodes symbol", () => {
  assert.equal(
    yahooFinanceQuoteUrl("BHP.AX"),
    "https://finance.yahoo.com/quote/BHP.AX/",
  );
});

test("bybitLinearPerpTradeUrl uses mainnet by default", () => {
  const prev = process.env.BYBIT_TESTNET;
  delete process.env.BYBIT_TESTNET;
  try {
    assert.equal(
      bybitLinearPerpTradeUrl("RNDRUSDT"),
      "https://www.bybit.com/trade/usdt/RNDRUSDT",
    );
  } finally {
    if (prev !== undefined) process.env.BYBIT_TESTNET = prev;
  }
});

test("resolveMarketOutlink prefers Bybit when seedSource is bybit-index", () => {
  const link = resolveMarketOutlink({
    oracleSymbol: "RNDR-USD",
    seedSource: "bybit-index",
    bybitSymbol: "RNDRUSDT",
  });
  assert.equal(link?.venue, "bybit");
  assert.ok(link?.href.includes("bybit.com/trade/usdt/RNDRUSDT"));
});

test("resolveMarketOutlink uses Yahoo for equities", () => {
  const link = resolveMarketOutlink({ oracleSymbol: "BHP.AX" });
  assert.equal(link?.venue, "yahoo");
  assert.ok(link?.href.includes("finance.yahoo.com/quote/BHP.AX"));
});
