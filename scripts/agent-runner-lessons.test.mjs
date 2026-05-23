// Unit tests for the closed-position post-mortem helpers introduced for the
// "## Lessons" prompt block. Imports the runner via dynamic import so the
// top-level LLM_API_KEY check in `runAgent` doesn't fire (we only exercise
// pure helpers exported as named exports).

import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  findMatchingOpen,
  buildClosedPositionEntry,
  buildLessonsBlock,
} from "./agent-runner.mjs";

const VAULT = "0x000000000000000000000000000000000000000a";
const ASSET = "0x" + "11".repeat(32);

test("findMatchingOpen finds the most recent open in the current run", () => {
  const currentRunActions = [
    {
      tool: "open_position",
      args: { vault: VAULT, assetId: ASSET, isLong: true, size: "100", collateral: "10" },
      skipped: false,
      justification: "Strong GT signal",
      timestamp: "2026-05-01T00:00:00Z",
      txHash: "0xaaa",
    },
  ];
  const hit = findMatchingOpen({
    vault: VAULT,
    assetId: ASSET,
    isLong: true,
    currentRunActions,
    recentRuns: [],
  });
  assert.ok(hit);
  assert.equal(hit.justification, "Strong GT signal");
  assert.equal(hit.txHash, "0xaaa");
});

test("findMatchingOpen falls back to recentRuns when the open is from a prior run", () => {
  const recentRuns = [
    {
      timestamp: "2026-04-30T00:00:00Z",
      writeActions: [
        {
          tool: "open_position",
          args: { vault: VAULT, assetId: ASSET, isLong: true },
          skipped: false,
          justification: "Prior-run thesis",
          timestamp: "2026-04-30T00:00:00Z",
        },
      ],
    },
  ];
  const hit = findMatchingOpen({
    vault: VAULT,
    assetId: ASSET,
    isLong: true,
    currentRunActions: [],
    recentRuns,
  });
  assert.ok(hit);
  assert.equal(hit.justification, "Prior-run thesis");
});

test("findMatchingOpen ignores opposite-direction legs", () => {
  const currentRunActions = [
    {
      tool: "open_position",
      args: { vault: VAULT, assetId: ASSET, isLong: false },
      skipped: false,
      justification: "Short on red-flag",
      timestamp: "2026-05-01T00:00:00Z",
    },
  ];
  const longHit = findMatchingOpen({
    vault: VAULT,
    assetId: ASSET,
    isLong: true,
    currentRunActions,
    recentRuns: [],
  });
  assert.equal(longHit, null);
  const shortHit = findMatchingOpen({
    vault: VAULT,
    assetId: ASSET,
    isLong: false,
    currentRunActions,
    recentRuns: [],
  });
  assert.ok(shortHit);
  assert.equal(shortHit.justification, "Short on red-flag");
});

test("findMatchingOpen skips skipped writeActions (dry-run / NO_CHANGE)", () => {
  const currentRunActions = [
    {
      tool: "open_position",
      args: { vault: VAULT, assetId: ASSET, isLong: true },
      skipped: true,
      justification: "skipped",
      timestamp: "2026-05-01T00:00:00Z",
    },
  ];
  const hit = findMatchingOpen({
    vault: VAULT,
    assetId: ASSET,
    isLong: true,
    currentRunActions,
    recentRuns: [],
  });
  assert.equal(hit, null);
});

test("buildClosedPositionEntry computes holdHours from matched open", () => {
  const matchingOpen = {
    timestamp: "2026-05-01T00:00:00Z",
    justification: "entry",
    runId: "run-1",
    txHash: "0xaaa",
  };
  const entry = buildClosedPositionEntry({
    vault: VAULT,
    assetId: ASSET,
    isLong: true,
    ticker: "AHR.V",
    closedAt: "2026-05-01T05:30:00Z",
    closedReason: "pnl_band:above_take_profit",
    closeJustification: "+10% take profit",
    realizedPnlUsdc: "1000000",
    realizedPnlPctOfCollateral: 0.085,
    matchingOpen,
  });
  assert.equal(entry.side, "long");
  assert.equal(entry.holdHours, 5.5);
  assert.equal(entry.entryJustification, "entry");
  assert.equal(entry.entryRunId, "run-1");
  assert.equal(entry.entryTxHash, "0xaaa");
  assert.equal(entry.ticker, "AHR.V");
});

test("buildClosedPositionEntry survives missing matchingOpen", () => {
  const entry = buildClosedPositionEntry({
    vault: VAULT,
    assetId: ASSET,
    isLong: false,
    ticker: "PWM.V",
    closedAt: "2026-05-01T05:30:00Z",
    closedReason: "llm_judged: bearish news",
  });
  assert.equal(entry.side, "short");
  assert.equal(entry.holdHours, null);
  assert.equal(entry.entryJustification, null);
  assert.equal(entry.ticker, "PWM.V");
});

test("buildLessonsBlock ranks winners desc, losers asc, and quotes entry justifications", () => {
  const runs = [
    {
      timestamp: new Date().toISOString(),
      closedPositions: [
        {
          ticker: "GSR.V",
          side: "long",
          closedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          closedReason: "pnl_band:above_take_profit",
          realizedPnlPctOfCollateral: 0.14,
          holdHours: 72,
          entryJustification: "Exceptional GT=754 (NGEx Lunahuasi anchor)",
        },
        {
          ticker: "PWM.V",
          side: "long",
          closedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
          closedReason: "pnl_band:below_stop_loss",
          realizedPnlPctOfCollateral: -0.07,
          holdHours: 24,
          entryJustification: "Strong Cu grade 2.25% over 335m",
        },
        {
          ticker: "AHR.V",
          side: "long",
          closedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
          closedReason: "rank_swap: dropped from ML top-10",
          realizedPnlPctOfCollateral: 0.03,
          holdHours: 8,
          entryJustification: "ML score 91",
        },
      ],
    },
  ];
  const block = buildLessonsBlock({ runs });
  assert.match(block, /## Lessons/);
  assert.match(block, /Wins/);
  assert.match(block, /Losses/);
  // Top winner is GSR.V (+14%), top loser is PWM.V (-7%); both quoted.
  assert.match(block, /GSR\.V long \+14\.0%/);
  assert.match(block, /Exceptional GT=754/);
  assert.match(block, /PWM\.V long -7\.0%/);
  assert.match(block, /Strong Cu grade/);
});

test("buildLessonsBlock returns empty string when no closures recorded", () => {
  const runs = [{ timestamp: new Date().toISOString(), closedPositions: [] }];
  const block = buildLessonsBlock({ runs });
  assert.equal(block, "");
});

test("buildLessonsBlock drops closures past the 30-day window", () => {
  const ancient = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
  const runs = [
    {
      timestamp: new Date().toISOString(),
      closedPositions: [
        {
          ticker: "OLD.V",
          side: "long",
          closedAt: ancient,
          realizedPnlPctOfCollateral: 0.2,
          entryJustification: "ancient win",
        },
      ],
    },
  ];
  const block = buildLessonsBlock({ runs });
  assert.equal(block, "");
});

test("buildLessonsBlock falls back to chronological list when no realised PnL is recorded", () => {
  const runs = [
    {
      timestamp: new Date().toISOString(),
      closedPositions: [
        {
          ticker: "NPL.V",
          side: "long",
          closedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          closedReason: "llm_judged: bearish headline",
          entryJustification: "Atlas top-5",
          realizedPnlPctOfCollateral: null,
        },
      ],
    },
  ];
  const block = buildLessonsBlock({ runs });
  assert.match(block, /chronological/);
  assert.match(block, /NPL\.V long/);
  assert.match(block, /Atlas top-5/);
});
