import { test } from "node:test";
import assert from "node:assert/strict";

import { classifyConfidenceTier } from "./confidence-tier.mjs";

test("high tier requires both wallet depth and meaningful USD flow", () => {
  assert.deepEqual(
    classifyConfidenceTier({ smartMoneyWalletCount: 15, netFlow7dUsd: 300_000 }),
    { tier: "high", score: 80 },
  );
});

test("medium tier when flow is positive but below high cutoff", () => {
  assert.deepEqual(
    classifyConfidenceTier({ smartMoneyWalletCount: 7, netFlow7dUsd: 50_000 }),
    { tier: "medium", score: 65 },
  );
});

test("low tier when only wallet count or flow is present", () => {
  assert.deepEqual(
    classifyConfidenceTier({ smartMoneyWalletCount: 4, netFlow7dUsd: 0 }),
    { tier: "low", score: 40 },
  );
});

test("none when neither signal is present", () => {
  assert.deepEqual(
    classifyConfidenceTier({ smartMoneyWalletCount: 0, netFlow7dUsd: 0 }),
    { tier: "none", score: 0 },
  );
});

test("handles missing / non-finite inputs", () => {
  assert.deepEqual(
    classifyConfidenceTier({ smartMoneyWalletCount: undefined, netFlow7dUsd: NaN }),
    { tier: "none", score: 0 },
  );
});
