import assert from "node:assert/strict";
import test from "node:test";

import {
  canUseBybitIndexOracleFallback,
  isCryptoAgentSymbol,
} from "./oracle-seed-price.mjs";
import { oracleSymbolToYahooSymbol } from "./yahoo-symbol-map.mjs";

test("ETH-USD is crypto and allowlisted for Bybit index fallback", () => {
  assert.ok(isCryptoAgentSymbol("ETH-USD"));
  assert.ok(canUseBybitIndexOracleFallback("ETH-USD"));
  assert.equal(oracleSymbolToYahooSymbol("ETH-USD"), "ETH-USD");
});

test("MATIC-USD maps to POL-USD on Yahoo before fallback", () => {
  assert.ok(isCryptoAgentSymbol("MATIC-USD"));
  assert.equal(oracleSymbolToYahooSymbol("MATIC-USD"), "POL-USD");
});

test("equities are not Bybit fallback eligible", () => {
  assert.equal(isCryptoAgentSymbol("BHP.AX"), false);
  assert.equal(canUseBybitIndexOracleFallback("BHP.AX"), false);
});
