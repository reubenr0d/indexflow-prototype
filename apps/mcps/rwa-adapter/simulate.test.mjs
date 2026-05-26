import { test } from "node:test";
import assert from "node:assert/strict";

import {
  projectReserveStateAfter,
  projectRotationAfter,
  reserveTokenIndexOf,
  reserveTokenNameOf,
} from "./simulate.mjs";

test("projectReserveStateAfter: allocate moves idle into reserve", () => {
  const out = projectReserveStateAfter({
    kind: "allocate",
    idleUsdc: "1000000000", // $1000
    reserveValueUsdc: "0",
    perpEquityUsdc: "0",
    usdcAmount: "700000000", // $700
  });
  assert.equal(out.projectedIdleUsdc, "300000000");
  assert.equal(out.projectedReserveUsdc, "700000000");
  assert.equal(out.projectedTotalUsdc, "1000000000");
  assert.equal(out.projectedReserveBps, 7000);
});

test("projectReserveStateAfter: withdraw moves reserve back to idle", () => {
  const out = projectReserveStateAfter({
    kind: "withdraw",
    idleUsdc: "300000000",
    reserveValueUsdc: "700000000",
    perpEquityUsdc: "0",
    usdcAmount: "200000000",
  });
  assert.equal(out.projectedIdleUsdc, "500000000");
  assert.equal(out.projectedReserveUsdc, "500000000");
  assert.equal(out.projectedReserveBps, 5000);
});

test("projectReserveStateAfter: rejects allocate exceeding idle", () => {
  assert.throws(() =>
    projectReserveStateAfter({
      kind: "allocate",
      idleUsdc: "100",
      reserveValueUsdc: "0",
      perpEquityUsdc: "0",
      usdcAmount: "200",
    }),
  );
});

test("projectReserveStateAfter: redemption margin includes 1.10x buffer", () => {
  // idle after = $400, pending = $200, required margin = $220, margin = $180.
  const out = projectReserveStateAfter({
    kind: "allocate",
    idleUsdc: "1000000000", // $1000
    reserveValueUsdc: "0",
    perpEquityUsdc: "0",
    usdcAmount: "600000000", // $600 -> idle becomes $400
    pendingRedemptionsUsdc: "200000000", // $200
  });
  assert.equal(out.redemptionMarginAfterUsdc, "180000000");
  assert.equal(out.redemptionMarginAfterIsPositive, true);
});

test("projectReserveStateAfter: margin flips negative when allocation breaches pending", () => {
  const out = projectReserveStateAfter({
    kind: "allocate",
    idleUsdc: "1000000000",
    reserveValueUsdc: "0",
    perpEquityUsdc: "0",
    usdcAmount: "900000000",
    pendingRedemptionsUsdc: "200000000",
  });
  assert.equal(out.redemptionMarginAfterIsPositive, false);
});

test("projectRotationAfter: subtracts slippage cost from reserve", () => {
  // $1000 reserve, 50 bps slippage = $5 cost.
  const out = projectRotationAfter({
    reserveValueUsdc: "1000000000",
    perpEquityUsdc: "0",
    idleUsdc: "0",
    slippageBps: 50,
  });
  assert.equal(out.slippageUsdcCost, "5000000");
  assert.equal(out.projectedReserveUsdc, "995000000");
});

test("reserveTokenIndexOf and reserveTokenNameOf round-trip", () => {
  assert.equal(reserveTokenIndexOf("USDY"), 0);
  assert.equal(reserveTokenIndexOf("musd"), 1);
  assert.equal(reserveTokenIndexOf("METH"), 2);
  assert.equal(reserveTokenNameOf(0), "USDY");
  assert.equal(reserveTokenNameOf(2), "METH");
  assert.throws(() => reserveTokenIndexOf("FOO"));
  assert.throws(() => reserveTokenNameOf(99));
});
