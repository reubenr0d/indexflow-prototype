import assert from "node:assert/strict";
import test from "node:test";

import { fetchBybitPriceHistory } from "./bybit-price-history.mjs";

test("fetchBybitPriceHistory rejects missing symbol", async () => {
  const r = await fetchBybitPriceHistory("", { lookbackHours: 168 });
  assert.equal(r.ok, false);
  assert.equal(r.error, "missing_symbol");
});

test("compute stats from fixture candles via internal parse path", async () => {
  const original = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return {
        retCode: 0,
        retMsg: "OK",
        result: {
          category: "linear",
          list: [
            ["1700000000000", "100", "101", "99", "100", "1", "100"],
            ["1700086400000", "100", "105", "99", "104", "1", "104"],
            ["1700172800000", "104", "110", "103", "108", "1", "108"],
          ],
        },
      };
    },
  });

  try {
    const r = await fetchBybitPriceHistory("BTCUSDT", { lookbackHours: 168 });
    assert.equal(r.ok, true);
    assert.equal(r.barCount, 3);
    assert.equal(r.returnBps, 800);
    assert.ok(r.sevenDayVolBps > 0);
    assert.ok(r.maxPeriodMoveBps >= 400);
  } finally {
    global.fetch = original;
  }
});
