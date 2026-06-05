import test from "node:test";
import assert from "node:assert/strict";

import {
  validateSeedPriceUsd,
  SEED_PRICE_MAX_DEVIATION_BPS,
  yahooUsdRateForQuoteCurrency,
} from "../../shared/yahoo-usd-quote.mjs";

test("SEED_PRICE_MAX_DEVIATION_BPS is 2000 (matches OracleAdapter default)", () => {
  assert.equal(SEED_PRICE_MAX_DEVIATION_BPS, 2000);
});

test("GBp Yahoo quotes use one hundredth of GBP/USD for pence-denominated prices", () => {
  assert.equal(yahooUsdRateForQuoteCurrency("GBp", 1.347), 0.01347);
  assert.equal(yahooUsdRateForQuoteCurrency("GBP", 1.347), 1.347);
});

test("exact match returns ok with devBps=0", () => {
  const r = validateSeedPriceUsd(45.2, 45.2);
  assert.equal(r.ok, true);
  assert.equal(r.devBps, 0);
});

test("+5% within tolerance returns ok", () => {
  const r = validateSeedPriceUsd(105, 100);
  assert.equal(r.ok, true);
  assert.equal(r.devBps, 500);
});

test("exact 20% boundary returns ok (<= maxBps passes)", () => {
  const r = validateSeedPriceUsd(120, 100);
  assert.equal(r.ok, true);
  assert.equal(r.devBps, 2000);
});

test("+20.5% rejects with SEED_PRICE_DEVIATION-style payload", () => {
  const r = validateSeedPriceUsd(120.51, 100);
  assert.equal(r.ok, false);
  assert.equal(r.devBps > 2000, true);
  assert.match(r.reason, /deviation/);
});

test("-25% rejects (matches today's CGNT.V scale, ~94% off)", () => {
  // Sanity-check the actual incident: stored 7.22, live 0.464 -> 9358 bps
  const r = validateSeedPriceUsd(7.219, 0.464);
  assert.equal(r.ok, false);
  assert.equal(r.devBps > 2000, true);
});

test("livePriceUsd <= 0 rejects without divide-by-zero", () => {
  const r = validateSeedPriceUsd(10, 0);
  assert.equal(r.ok, false);
  assert.equal(Number.isFinite(r.devBps), false);
  assert.match(r.reason, /livePriceUsd/);
});

test("seedPriceUsd <= 0 rejects", () => {
  const r = validateSeedPriceUsd(0, 100);
  assert.equal(r.ok, false);
  assert.match(r.reason, /seedPriceUsd/);
});

test("NaN inputs reject (do not silently pass)", () => {
  assert.equal(validateSeedPriceUsd(NaN, 100).ok, false);
  assert.equal(validateSeedPriceUsd(100, NaN).ok, false);
});

test("custom maxBps override is honoured", () => {
  // 10% deviation, custom cap 500 bps (5%) -> reject
  const r1 = validateSeedPriceUsd(110, 100, 500);
  assert.equal(r1.ok, false);
  // 3% deviation, custom cap 500 bps (5%) -> pass
  const r2 = validateSeedPriceUsd(103, 100, 500);
  assert.equal(r2.ok, true);
});
