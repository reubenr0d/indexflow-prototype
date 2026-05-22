import test from "node:test";
import assert from "node:assert/strict";

import { computePositionPnl, PNL_BAND_DEFAULTS } from "./position-pnl.mjs";

// `computePositionPnl` is the load-bearing math behind:
//   - apps/mcps/vault-manager/index.js `buildOpenPositionsRoster` (per-leg
//     fields surfaced by list_open_positions and get_perp_capital_snapshot)
//   - the open-position `INSUFFICIENT_COLLATERAL` roster embed
//   - the runner-side `computePnlBandClosures` decision helper
//
// If any field name or scaling changes here, the agent prompt step-9 logic
// in agents/mining-manager.md needs to be updated too.

const E30 = 10n ** 30n;
const E8 = 10n ** 8n;

function gmxSize(usd) {
  // $1 -> 1e30
  return (BigInt(Math.round(usd)) * E30).toString();
}
function oraclePrice(usd) {
  // $1 -> 1e8
  return (BigInt(Math.round(usd * 1e8))).toString();
}
function usdcAmount(usd) {
  // $1 -> 1e6
  return (BigInt(Math.round(usd * 1e6))).toString();
}

test("computePositionPnl: long position with price up returns positive PnL within band", () => {
  // size $1000 long, avg $10, current $10.50 → +5% notional move → +$50
  // collateral $100 → +50% of collateral (above the +8% TP band).
  const out = computePositionPnl({
    isLong: true,
    size: gmxSize(1000),
    averagePrice: oraclePrice(10),
    currentOraclePrice: oraclePrice(10.5),
    collateralUsdc: usdcAmount(100),
  });
  assert.equal(out.unrealisedPnlUsdc, usdcAmount(50));
  assert.equal(out.unrealisedPnlUsdc_usdc, "+50.00");
  assert.ok(Math.abs(out.unrealisedPnlPctOfCollateral - 0.5) < 1e-9);
  assert.equal(out.pnlBandOutcome, "above_take_profit");
});

test("computePositionPnl: long position with price down returns negative PnL", () => {
  // size $1000 long, avg $10, current $9.50 → -5% notional move → -$50
  // collateral $100 → -50% of collateral (below the -6% SL band).
  const out = computePositionPnl({
    isLong: true,
    size: gmxSize(1000),
    averagePrice: oraclePrice(10),
    currentOraclePrice: oraclePrice(9.5),
    collateralUsdc: usdcAmount(100),
  });
  assert.equal(out.unrealisedPnlUsdc, (-BigInt(usdcAmount(50))).toString());
  assert.equal(out.unrealisedPnlUsdc_usdc, "-50.00");
  assert.ok(Math.abs(out.unrealisedPnlPctOfCollateral - -0.5) < 1e-9);
  assert.equal(out.pnlBandOutcome, "below_stop_loss");
});

test("computePositionPnl: short flips sign convention", () => {
  // size $1000 short, avg $10, current $9.50 → price moved -5% → +$50 for
  // the short, +50% of $100 collateral → above take profit.
  const out = computePositionPnl({
    isLong: false,
    size: gmxSize(1000),
    averagePrice: oraclePrice(10),
    currentOraclePrice: oraclePrice(9.5),
    collateralUsdc: usdcAmount(100),
  });
  assert.equal(out.unrealisedPnlUsdc, usdcAmount(50));
  assert.equal(out.unrealisedPnlUsdc_usdc, "+50.00");
  assert.equal(out.pnlBandOutcome, "above_take_profit");
});

test("computePositionPnl: small move stays within the band", () => {
  // 1% price move on a 1x notional → +1% of collateral → within band.
  const out = computePositionPnl({
    isLong: true,
    size: gmxSize(100),
    averagePrice: oraclePrice(10),
    currentOraclePrice: oraclePrice(10.1),
    collateralUsdc: usdcAmount(100),
  });
  assert.equal(out.pnlBandOutcome, "within");
  assert.ok(out.unrealisedPnlPctOfCollateral > 0);
  assert.ok(out.unrealisedPnlPctOfCollateral < PNL_BAND_DEFAULTS.takeProfitPct);
});

test("computePositionPnl: zero/null avgPrice returns unknown rather than dividing by zero", () => {
  const out = computePositionPnl({
    isLong: true,
    size: gmxSize(100),
    averagePrice: "0",
    currentOraclePrice: oraclePrice(10),
    collateralUsdc: usdcAmount(100),
  });
  assert.equal(out.unrealisedPnlUsdc, null);
  assert.equal(out.unrealisedPnlPctOfCollateral, null);
  assert.equal(out.pnlBandOutcome, "unknown");
});

test("computePositionPnl: null currentOraclePrice returns unknown (oracle not seeded)", () => {
  const out = computePositionPnl({
    isLong: true,
    size: gmxSize(100),
    averagePrice: oraclePrice(10),
    currentOraclePrice: null,
    collateralUsdc: usdcAmount(100),
  });
  assert.equal(out.pnlBandOutcome, "unknown");
});

test("computePositionPnl: zero collateralUsdc emits null pct but still computes pnl USDC", () => {
  const out = computePositionPnl({
    isLong: true,
    size: gmxSize(100),
    averagePrice: oraclePrice(10),
    currentOraclePrice: oraclePrice(11),
    collateralUsdc: "0",
  });
  // 10% notional move on a $100 size = +$10
  assert.equal(out.unrealisedPnlUsdc, usdcAmount(10));
  assert.equal(out.unrealisedPnlPctOfCollateral, null);
  assert.equal(out.pnlBandOutcome, "unknown");
});

test("computePositionPnl: custom TP/SL thresholds override the defaults", () => {
  const out = computePositionPnl({
    isLong: true,
    size: gmxSize(100),
    averagePrice: oraclePrice(10),
    currentOraclePrice: oraclePrice(10.5), // +5% notional → +$5 → +5% of $100
    collateralUsdc: usdcAmount(100),
    takeProfitPct: 0.04, // tighter TP than default
    stopLossPct: 0.06,
  });
  assert.equal(out.pnlBandOutcome, "above_take_profit");
});

test("PNL_BAND_DEFAULTS match the mining-manager prompt's [-6%, +8%]", () => {
  assert.equal(PNL_BAND_DEFAULTS.takeProfitPct, 0.08);
  assert.equal(PNL_BAND_DEFAULTS.stopLossPct, 0.06);
});
