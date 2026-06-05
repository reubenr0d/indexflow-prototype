import assert from "node:assert/strict";
import test from "node:test";

import { __atlasMlInternals } from "./index.js";

const {
  buildYahooSymbol,
  normaliseShortPick,
  selectShortPicks,
} = __atlasMlInternals;

test("normaliseShortPick derives yahoo symbol and absolute predicted return", () => {
  const pick = normaliseShortPick({
    name: "Galantas Gold Corporation",
    ticker: "GAL",
    exchange: "TSXV",
    ml_score: 0.6,
    ml_predicted_return: -0.4493,
    market_cap_usd: 78098617.28,
    primary_commodity: "gold",
    drill_activity_score: 65,
    vault_fit_tier: "A",
  });

  assert.equal(pick.yahooSymbol, "GAL.V");
  assert.equal(pick.side, "short");
  assert.equal(pick.mlPredictedReturn, -0.4493);
  assert.equal(pick.absPredictedReturn, 0.4493);
  assert.equal(pick.primaryCommodity, "gold");
});

test("selectShortPicks filters negative-return low-score picks and ranks by profit potential", () => {
  const picks = selectShortPicks(
    [
      { ticker: "AAA", exchange: "TSX", ml_score: 2, ml_predicted_return: -0.2 },
      { ticker: "BBB", exchange: "ASX", ml_score: 1, ml_predicted_return: -0.5 },
      { ticker: "CCC", exchange: "NYSE", ml_score: 25, ml_predicted_return: -0.8 },
      { ticker: "DDD", exchange: "NASDAQ", ml_score: 3, ml_predicted_return: 0.4 },
      { ticker: "EEE", exchange: "UNKNOWN", ml_score: 2, ml_predicted_return: -0.9 },
    ],
    { limit: 2, maxScore: 20, minAbsPredictedReturn: 0.25 },
  );

  assert.deepEqual(
    picks.map((p) => p.yahooSymbol),
    ["BBB.AX"],
  );
  assert.equal(picks[0].absPredictedReturn, 0.5);
});

test("selectShortPicks uses ml score as tie-breaker after absolute predicted return", () => {
  const picks = selectShortPicks(
    [
      { ticker: "HIGH", exchange: "NYSE", ml_score: 8, ml_predicted_return: -0.4 },
      { ticker: "LOW", exchange: "NYSE", ml_score: 2, ml_predicted_return: -0.4 },
    ],
    { limit: 2, maxScore: 20 },
  );

  assert.deepEqual(
    picks.map((p) => p.yahooSymbol),
    ["LOW", "HIGH"],
  );
});

test("buildYahooSymbol keeps US tickers unsuffixed and maps mining exchanges", () => {
  assert.equal(buildYahooSymbol("AEM", "NYSE"), "AEM");
  assert.equal(buildYahooSymbol("BTO", "TSX"), "BTO.TO");
  assert.equal(buildYahooSymbol("BIG", "TSXV"), "BIG.V");
  assert.equal(buildYahooSymbol("MI6", "ASX"), "MI6.AX");
});
