const test = require('node:test');
const assert = require('node:assert/strict');

const { __testing } = require('./update-yahoo-finance-prices.js');

const {
  normalizePrice,
  computeDeviationBps,
  parseAssetConfig,
  parsePriceTuple,
  classifyPriceCandidate,
} = __testing;

test('normalizePrice scales 8 decimals to 1e30 precision', () => {
  const raw = 71230000n; // 0.7123 * 1e8
  const norm = normalizePrice(raw, 8);
  assert.equal(norm, 712300000000000000000000000000n);
});

test('computeDeviationBps calculates relative move', () => {
  const oldP = 2152080000000000000000000000n;
  const newP = 712300000000000000000000000n;
  const bps = computeDeviationBps(oldP, newP);
  assert.equal(bps, 6690n);
});

test('parseAssetConfig parses cast tuple shape', () => {
  const raw = '(0x0000000000000000000000000000000000000000, 1, 3600, 2000, 8, true)';
  const cfg = parseAssetConfig(raw);
  assert.equal(cfg.feedType, 1);
  assert.equal(cfg.stalenessThreshold, 3600n);
  assert.equal(cfg.deviationBps, 2000n);
  assert.equal(cfg.decimals, 8);
  assert.equal(cfg.active, true);
});

test('parsePriceTuple parses getPrice return shape', () => {
  const raw = '(2152080000000000000000000000, 1748420220)';
  const out = parsePriceTuple(raw);
  assert.equal(out.price, 2152080000000000000000000000n);
  assert.equal(out.timestamp, 1748420220n);
});

test('parsePriceTuple parses multiline cast output shape', () => {
  const raw = '2152080000000000000000000000 [2.152e27]\\n1779840108 [1.779e9]';
  const out = parsePriceTuple(raw);
  assert.equal(out.price, 2152080000000000000000000000n);
  assert.equal(out.timestamp, 1779840108n);
});

test('classifyPriceCandidate marks within/equal threshold as normal', () => {
  const oldP = 1000000000000000000000000000n;
  const within = classifyPriceCandidate(oldP, 1199900000000000000000000000n, 2000n);
  assert.equal(within.status, 'normal');

  const equal = classifyPriceCandidate(oldP, 1200000000000000000000000000n, 2000n);
  assert.equal(equal.status, 'normal');
});

test('classifyPriceCandidate marks above threshold as override-required', () => {
  const oldP = 1000000000000000000000000000n;
  const exceeds = classifyPriceCandidate(oldP, 1300000000000000000000000000n, 2000n);
  assert.equal(exceeds.status, 'override-required');
  assert.ok(exceeds.deviationBps > 2000n);
});
