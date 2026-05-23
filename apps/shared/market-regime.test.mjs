// Unit tests for the pure market-regime classifier shared by the
// `get_market_regime` MCP tool and the runner's short-side gate.

import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  classifyMarketRegime,
  REGIME_COMPONENT_SYMBOLS,
  SHORT_PENALTY_HIGH_PCT,
  SHORT_PENALTY_LOW_PCT,
} from "./market-regime.mjs";

test("metals_risk_on when 4 of 5 components vote bullish-for-miners", () => {
  const result = classifyMarketRegime({
    "GC=F": 1.2,
    "HG=F": 2.1,
    "XME": 3.4,
    "GDX": 2.8,
    "DX-Y.NYB": -0.4,
  });
  assert.equal(result.regime, "metals_risk_on");
  assert.equal(result.bullishCount, 5);
  assert.equal(result.shortPenalty, 2);
});

test("metals_risk_off when 3 of 5 components vote bearish-for-miners", () => {
  const result = classifyMarketRegime({
    "GC=F": -1.5,
    "HG=F": -0.8,
    "XME": -2.5,
    "GDX": 0.2,
    "DX-Y.NYB": 0.6,
  });
  assert.equal(result.regime, "metals_risk_off");
});

test("metals_neutral when no side reaches 3 votes", () => {
  const result = classifyMarketRegime({
    "GC=F": 0.1,
    "HG=F": -0.1,
    "XME": 0.5,
    "GDX": -0.5,
    "DX-Y.NYB": 0,
  });
  assert.equal(result.regime, "metals_neutral");
});

test("USD index counts INVERSELY (DXY down = bullish for miners)", () => {
  const result = classifyMarketRegime({
    "DX-Y.NYB": -0.5,
  });
  assert.equal(result.components["DX-Y.NYB"].vote, 1);
});

test("shortPenalty=2 when XME OR GDX day change >= +3%", () => {
  const xmeUp = classifyMarketRegime({
    "GC=F": 0.1, "HG=F": 0.1, "XME": SHORT_PENALTY_HIGH_PCT, "GDX": 0.5, "DX-Y.NYB": 0,
  });
  assert.equal(xmeUp.shortPenalty, 2);
  const gdxUp = classifyMarketRegime({
    "GC=F": 0.1, "HG=F": 0.1, "XME": 0.5, "GDX": SHORT_PENALTY_HIGH_PCT, "DX-Y.NYB": 0,
  });
  assert.equal(gdxUp.shortPenalty, 2);
});

test("shortPenalty=1 when XME OR GDX day change >= +1% but < +3%", () => {
  const result = classifyMarketRegime({
    "GC=F": 0.1, "HG=F": 0.1, "XME": SHORT_PENALTY_LOW_PCT, "GDX": 0.2, "DX-Y.NYB": 0,
  });
  assert.equal(result.shortPenalty, 1);
});

test("longBonus mirrors shortPenalty on the downside", () => {
  const result = classifyMarketRegime({
    "GC=F": -0.1, "HG=F": -0.1, "XME": -3.5, "GDX": -1.0, "DX-Y.NYB": 0,
  });
  assert.equal(result.longBonus, 2);
});

test("unavailable components are reported as neutral, classification still runs", () => {
  const result = classifyMarketRegime({
    "GC=F": 1.0,
    "HG=F": 1.5,
    // XME / GDX / DXY all missing
  });
  assert.equal(result.components["XME"].status, "unavailable");
  assert.equal(result.bullishCount, 2);
  assert.equal(result.regime, "metals_neutral");
  // Without XME/GDX numbers shortPenalty falls back to 0 (no squeeze risk
  // detected because we have no miners reading).
  assert.equal(result.shortPenalty, 0);
});

test("NaN / null / string inputs are treated as unavailable, not bullish", () => {
  const result = classifyMarketRegime({
    "GC=F": Number.NaN,
    "HG=F": null,
    "XME": "1.2",
    "GDX": undefined,
    "DX-Y.NYB": 0.5,
  });
  for (const sym of REGIME_COMPONENT_SYMBOLS.slice(0, 4)) {
    assert.equal(result.components[sym].status, "unavailable");
  }
  // Only DX-Y.NYB had a usable reading (+0.5 = bearish for miners).
  assert.equal(result.bearishCount, 1);
  assert.equal(result.regime, "metals_neutral");
});

test("summary contains the regime label + each component's day change", () => {
  const result = classifyMarketRegime({
    "GC=F": 1.2, "HG=F": 2.1, "XME": 3.4, "GDX": 2.8, "DX-Y.NYB": -0.4,
  });
  assert.match(result.summary, /metals_risk_on/);
  assert.match(result.summary, /GC=F: \+1\.20%/);
  assert.match(result.summary, /XME: \+3\.40%/);
  assert.match(result.summary, /shortPenalty=2/);
});
