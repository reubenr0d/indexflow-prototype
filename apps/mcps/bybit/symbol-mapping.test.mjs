import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normaliseAgentSymbolToBybit,
  denormaliseBybitToAgent,
} from "./symbol-mapping.mjs";

test("normaliseAgentSymbolToBybit maps canonical agent symbols", () => {
  assert.equal(normaliseAgentSymbolToBybit("BTC-USD"), "BTCUSDT");
  assert.equal(normaliseAgentSymbolToBybit("eth-usd"), "ETHUSDT");
  assert.equal(normaliseAgentSymbolToBybit(" SOL-USD "), "SOLUSDT");
});

test("normaliseAgentSymbolToBybit passes through Bybit-style inputs", () => {
  assert.equal(normaliseAgentSymbolToBybit("BTCUSDT"), "BTCUSDT");
});

test("normaliseAgentSymbolToBybit rejects unknown bases and bad shapes", () => {
  assert.equal(normaliseAgentSymbolToBybit("FOO-USD"), null);
  assert.equal(normaliseAgentSymbolToBybit("BTC-USDT"), null);
  assert.equal(normaliseAgentSymbolToBybit("BTC"), null);
  assert.equal(normaliseAgentSymbolToBybit(""), null);
  assert.equal(normaliseAgentSymbolToBybit(null), null);
});

test("denormaliseBybitToAgent inverts the canonical mapping", () => {
  assert.equal(denormaliseBybitToAgent("BTCUSDT"), "BTC-USD");
  assert.equal(denormaliseBybitToAgent("ETHUSDT"), "ETH-USD");
  assert.equal(denormaliseBybitToAgent("BTC-USD"), null);
  assert.equal(denormaliseBybitToAgent(""), null);
});
