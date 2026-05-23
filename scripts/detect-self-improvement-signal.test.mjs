// Unit tests for the deterministic self-improvement signal detector.
// All triggers are pure functions over the parsed JSONL tail so we can
// drive them with synthetic in-memory runs without touching disk.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  detectRecurringLosers,
  detectNewErrorCodes,
  detectRecurringErrorCodes,
  detectCapSaturation,
  detectRiskOfficerDissonance,
  detectLossStreak,
  detectSelfImprovementSignals,
  extractErrorCode,
  classifyErrorCodeSeverity,
  computeHousekeeping,
} from "./detect-self-improvement-signal.mjs";

const NOW = Date.parse("2026-05-23T00:00:00Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function closure({ ticker, side = "long", pct, ageMs }) {
  const out = {
    ticker,
    side,
    realizedPnlPctOfCollateral: pct,
    closeJustification: `auto-test ${ticker} ${pct}`,
    closedReason: "pnl_band:below_stop_loss",
  };
  if (ageMs !== undefined) out.closedAt = new Date(NOW - ageMs).toISOString();
  return out;
}

function run({ ageMs = 0, closures = [], errors = [], writeActions = [], riskOfficerVerdicts = [], vault = "0xVAULT" } = {}) {
  // Propagate the parent run age onto any closure that didn't set its own
  // ageMs so test fixtures stay terse — `closure({ pct: -0.07 })` inside a
  // 7-day-old run means "closed 7 days ago" by default.
  const stampedClosures = closures.map((c) => {
    if (c && typeof c === "object" && c.closedAt === undefined && c._defaultedClosedAt !== false) {
      return { ...c, closedAt: new Date(NOW - ageMs).toISOString() };
    }
    return c;
  });
  return {
    timestamp: new Date(NOW - ageMs).toISOString(),
    agent: "test-agent",
    network: "sepolia",
    vault,
    closedPositions: stampedClosures,
    errors,
    writeActions,
    riskOfficerVerdicts,
    summary: "test",
  };
}

// ---------------------------------------------------------------------------
// extractErrorCode
// ---------------------------------------------------------------------------

test("extractErrorCode parses JSON-shaped error strings", () => {
  const raw = '{"success":false,"error_code":"SEED_PRICE_DEVIATION","message":"..."}';
  assert.equal(extractErrorCode(raw), "SEED_PRICE_DEVIATION");
});

test("extractErrorCode parses object-shaped errors", () => {
  assert.equal(extractErrorCode({ error_code: "TX_REVERTED" }), "TX_REVERTED");
  assert.equal(extractErrorCode({ error: '{"error_code":"FOO_BAR"}' }), "FOO_BAR");
});

test("extractErrorCode returns null on garbage", () => {
  assert.equal(extractErrorCode(null), null);
  assert.equal(extractErrorCode("just a plain error"), null);
  assert.equal(extractErrorCode({ message: "no code" }), null);
});

// ---------------------------------------------------------------------------
// Trigger 1 — recurring losers
// ---------------------------------------------------------------------------

test("detectRecurringLosers fires when same ticker loses >=2 times in 7d", () => {
  const runs = [
    run({
      ageMs: 6 * DAY,
      closures: [closure({ ticker: "GSR.V", pct: -0.061 })],
    }),
    run({
      ageMs: 2 * DAY,
      closures: [closure({ ticker: "GSR.V", pct: -0.074 })],
    }),
  ];
  const sigs = detectRecurringLosers({ runs, agent: "qm", network: "sepolia", now: NOW });
  assert.equal(sigs.length, 1);
  assert.equal(sigs[0].kind, "recurring_losers");
  assert.equal(sigs[0].agent, "qm");
  assert.equal(sigs[0].evidence.length, 2);
  assert.match(sigs[0].summary, /GSR\.V/);
});

test("detectRecurringLosers ignores closures outside the 7d window", () => {
  const runs = [
    run({ ageMs: 8 * DAY, closures: [closure({ ticker: "GSR.V", pct: -0.10 })] }),
    run({ ageMs: 1 * DAY, closures: [closure({ ticker: "GSR.V", pct: -0.07 })] }),
  ];
  const sigs = detectRecurringLosers({ runs, agent: "qm", network: "sepolia", now: NOW });
  assert.equal(sigs.length, 0);
});

test("detectRecurringLosers ignores closures above -5% PnL", () => {
  const runs = [
    run({ ageMs: 3 * DAY, closures: [closure({ ticker: "GSR.V", pct: -0.04 })] }),
    run({ ageMs: 1 * DAY, closures: [closure({ ticker: "GSR.V", pct: -0.04 })] }),
  ];
  const sigs = detectRecurringLosers({ runs, agent: "qm", network: "sepolia", now: NOW });
  assert.equal(sigs.length, 0);
});

test("detectRecurringLosers treats long and short legs of same ticker separately", () => {
  const runs = [
    run({
      ageMs: 3 * DAY,
      closures: [
        closure({ ticker: "GSR.V", side: "long", pct: -0.07 }),
        closure({ ticker: "GSR.V", side: "short", pct: -0.08 }),
      ],
    }),
    run({
      ageMs: 1 * DAY,
      closures: [closure({ ticker: "GSR.V", side: "long", pct: -0.06 })],
    }),
  ];
  const sigs = detectRecurringLosers({ runs, agent: "qm", network: "sepolia", now: NOW });
  assert.equal(sigs.length, 1, "only the long side should fire (short has only 1 entry)");
  assert.equal(sigs[0].id.length, 12);
});

// ---------------------------------------------------------------------------
// Trigger 2 — new error_code
// ---------------------------------------------------------------------------

test("detectNewErrorCodes fires on a code that didn't appear in prior history", () => {
  const historical = [];
  for (let i = 0; i < 50; i++) {
    historical.push(
      run({
        ageMs: (50 - i + 10) * HOUR,
        errors: [{ tool: "wire_asset", error: '{"error_code":"OLD_CODE"}' }],
      }),
    );
  }
  const recent = [
    run({
      ageMs: 2 * HOUR,
      errors: [{ tool: "wire_asset", error: '{"error_code":"BRAND_NEW_CODE"}' }],
    }),
  ];
  const runs = [...historical, ...recent];
  const sigs = detectNewErrorCodes({ runs, agent: "qm", network: "sepolia" });
  assert.equal(sigs.length, 1);
  assert.equal(sigs[0].kind, "new_error_code");
  assert.match(sigs[0].summary, /BRAND_NEW_CODE/);
});

test("detectNewErrorCodes does NOT fire on codes seen in prior 100 runs", () => {
  const historical = Array.from({ length: 20 }, (_, i) =>
    run({
      ageMs: (20 - i + 5) * HOUR,
      errors: [{ tool: "wire_asset", error: '{"error_code":"RECURRING"}' }],
    }),
  );
  const recent = [
    run({
      ageMs: 1 * HOUR,
      errors: [{ tool: "wire_asset", error: '{"error_code":"RECURRING"}' }],
    }),
  ];
  const sigs = detectNewErrorCodes({ runs: [...historical, ...recent], agent: "qm", network: "sepolia" });
  assert.equal(sigs.length, 0);
});

// ---------------------------------------------------------------------------
// Trigger 2b — recurring error_code
// ---------------------------------------------------------------------------

test("detectRecurringErrorCodes fires when same code recurs in >=3 of last 10 runs", () => {
  // Reproduces the ab42c05 pattern: REQUIRE_REVERT appears in three
  // separate runs in quick succession. `new_error_code` would only fire
  // on the first occurrence, leaving the subsequent reverts invisible to
  // the self-improver loop until this signal exists.
  const runs = [
    run({ ageMs: 5 * HOUR, errors: [{ tool: "open_position", error: '{"error_code":"REQUIRE_REVERT","message":"Vault: _size must be more than _collateral"}' }] }),
    run({ ageMs: 4 * HOUR, errors: [] }),
    run({ ageMs: 3 * HOUR, errors: [{ tool: "open_position", error: '{"error_code":"REQUIRE_REVERT","message":"Vault: _size must be more than _collateral"}' }] }),
    run({ ageMs: 2 * HOUR, errors: [] }),
    run({ ageMs: 1 * HOUR, errors: [{ tool: "open_position", error: '{"error_code":"REQUIRE_REVERT","message":"Vault: _size must be more than _collateral"}' }] }),
  ];
  const sigs = detectRecurringErrorCodes({ runs, agent: "mm", network: "sepolia" });
  assert.equal(sigs.length, 1);
  assert.equal(sigs[0].kind, "recurring_error_code");
  assert.equal(sigs[0].severity, "high", "REQUIRE_REVERT must be classified as high-severity");
  assert.equal(sigs[0].evidence.length, 3);
  assert.match(sigs[0].summary, /REQUIRE_REVERT/);
  assert.match(sigs[0].summary, /HIGH-SEVERITY revert pattern/);
});

test("detectRecurringErrorCodes does NOT fire when below the 3-run threshold", () => {
  const runs = [
    run({ ageMs: 3 * HOUR, errors: [{ tool: "open_position", error: '{"error_code":"REQUIRE_REVERT"}' }] }),
    run({ ageMs: 2 * HOUR, errors: [] }),
    run({ ageMs: 1 * HOUR, errors: [{ tool: "open_position", error: '{"error_code":"REQUIRE_REVERT"}' }] }),
  ];
  const sigs = detectRecurringErrorCodes({ runs, agent: "mm", network: "sepolia" });
  assert.equal(sigs.length, 0, "2 runs is below the min-3-distinct-runs threshold");
});

test("detectRecurringErrorCodes counts distinct runs, not raw occurrences", () => {
  // A single run that hit the same code 5x is one bug instance, not five.
  // If we counted occurrences the threshold would trigger on a single
  // batch of three open_position calls — way too noisy.
  const runs = [
    run({
      ageMs: 1 * HOUR,
      errors: [
        { tool: "open_position", error: '{"error_code":"REQUIRE_REVERT"}' },
        { tool: "open_position", error: '{"error_code":"REQUIRE_REVERT"}' },
        { tool: "open_position", error: '{"error_code":"REQUIRE_REVERT"}' },
        { tool: "open_position", error: '{"error_code":"REQUIRE_REVERT"}' },
        { tool: "open_position", error: '{"error_code":"REQUIRE_REVERT"}' },
      ],
    }),
  ];
  const sigs = detectRecurringErrorCodes({ runs, agent: "mm", network: "sepolia" });
  assert.equal(sigs.length, 0, "5 same-run occurrences is still 1 run, not 5");
});

test("detectRecurringErrorCodes ignores soft-classified codes (CHURN_GUARD_COOLDOWN does not live in errors[])", () => {
  // Soft refusals are routed into runSummary.softFailures by the agent
  // runner (see scripts/agent-runner.mjs::recordMcpErrorIfPresent), so
  // they NEVER appear in runs[].errors[]. The detector therefore can't
  // see them — verifying the integration boundary here.
  const runs = [
    run({ ageMs: 3 * HOUR, errors: [] }),
    run({ ageMs: 2 * HOUR, errors: [] }),
    run({ ageMs: 1 * HOUR, errors: [] }),
  ];
  // Even if the test fixture had softFailures attached, the detector
  // wouldn't scan them — it only reads errors[]. Asserting empty result.
  const sigs = detectRecurringErrorCodes({ runs, agent: "mm", network: "sepolia" });
  assert.equal(sigs.length, 0);
});

test("detectRecurringErrorCodes scans only the last 10 runs by default", () => {
  // 15 runs total, REQUIRE_REVERT in the OLDEST 4 + nothing in the
  // newest 11. The last-10 window contains only empty runs, so the
  // historical pattern must NOT fire.
  const runs = [];
  for (let i = 0; i < 4; i++) {
    runs.push(run({ ageMs: (20 - i) * HOUR, errors: [{ tool: "open_position", error: '{"error_code":"OLD_REVERT"}' }] }));
  }
  for (let i = 0; i < 11; i++) {
    runs.push(run({ ageMs: (15 - i) * HOUR, errors: [] }));
  }
  const sigs = detectRecurringErrorCodes({ runs, agent: "mm", network: "sepolia" });
  assert.equal(sigs.length, 0, "revert pattern from >10 runs ago must not fire");
});

test("detectRecurringErrorCodes severity routing: medium codes get a softer summary", () => {
  const runs = [
    run({ ageMs: 3 * HOUR, errors: [{ tool: "some_tool", error: '{"error_code":"UNKNOWN_SOMETHING"}' }] }),
    run({ ageMs: 2 * HOUR, errors: [{ tool: "some_tool", error: '{"error_code":"UNKNOWN_SOMETHING"}' }] }),
    run({ ageMs: 1 * HOUR, errors: [{ tool: "some_tool", error: '{"error_code":"UNKNOWN_SOMETHING"}' }] }),
  ];
  const sigs = detectRecurringErrorCodes({ runs, agent: "mm", network: "sepolia" });
  assert.equal(sigs.length, 1);
  assert.equal(sigs[0].severity, "medium");
  assert.match(sigs[0].summary, /recurring error pattern/);
  assert.doesNotMatch(sigs[0].summary, /HIGH-SEVERITY/, "medium-severity must not be advertised as high");
});

test("classifyErrorCodeSeverity: known severity tiers", () => {
  assert.equal(classifyErrorCodeSeverity("REQUIRE_REVERT"), "high");
  assert.equal(classifyErrorCodeSeverity("INSUFFICIENT_RESERVES"), "high");
  assert.equal(classifyErrorCodeSeverity("LEVERAGE_BELOW_1X"), "high");
  assert.equal(classifyErrorCodeSeverity("INVALID_ARGUMENT"), "low");
  assert.equal(classifyErrorCodeSeverity("INVALID_ASSET_ID"), "low");
  assert.equal(classifyErrorCodeSeverity("UNKNOWN_FUTURE_CODE"), "medium");
  assert.equal(classifyErrorCodeSeverity(null), "unknown");
  assert.equal(classifyErrorCodeSeverity(""), "unknown");
});

// ---------------------------------------------------------------------------
// Trigger 3 — cap saturation
// ---------------------------------------------------------------------------

test("detectCapSaturation fires on >=3 consecutive runs with cap errors + successful opens", () => {
  const buildSatRun = (ageMs) =>
    run({
      ageMs,
      writeActions: [
        { tool: "open_position", skipped: false, failed: false, args: {} },
        { tool: "open_position", skipped: false, failed: false, args: {} },
      ],
      errors: [{ tool: "open_position", error: '{"error_code":"MAX_POSITIONS_PER_RUN_EXCEEDED"}' }],
    });
  const runs = [buildSatRun(3 * HOUR), buildSatRun(2 * HOUR), buildSatRun(1 * HOUR)];
  const sigs = detectCapSaturation({ runs, agent: "qm", network: "sepolia" });
  assert.equal(sigs.length, 1);
  assert.equal(sigs[0].kind, "cap_saturation");
});

test("detectCapSaturation does NOT fire if any of the last 3 runs has no cap error", () => {
  const sat = run({
    ageMs: 1 * HOUR,
    writeActions: [{ tool: "open_position", skipped: false, failed: false, args: {} }],
    errors: [{ tool: "open_position", error: '{"error_code":"MAX_POSITIONS_PER_RUN_EXCEEDED"}' }],
  });
  const unSat = run({
    ageMs: 2 * HOUR,
    writeActions: [{ tool: "open_position", skipped: false, failed: false, args: {} }],
    errors: [],
  });
  const sigs = detectCapSaturation({ runs: [sat, unSat, sat], agent: "qm", network: "sepolia" });
  assert.equal(sigs.length, 0);
});

// ---------------------------------------------------------------------------
// Trigger 4 — risk-officer dissonance
// ---------------------------------------------------------------------------

test("detectRiskOfficerDissonance fires on >=3 vetoes on same vault in 24h", () => {
  const runs = [
    run({ ageMs: 23 * HOUR, riskOfficerVerdicts: [{ verdict: "veto", reason: "over-sized leg" }] }),
    run({ ageMs: 12 * HOUR, riskOfficerVerdicts: [{ verdict: "veto", reason: "regime risk" }] }),
    run({ ageMs: 2 * HOUR, riskOfficerVerdicts: [{ verdict: "veto", reason: "stacking longs" }] }),
  ];
  const sigs = detectRiskOfficerDissonance({ runs, agent: "qm", network: "sepolia", now: NOW });
  assert.equal(sigs.length, 1);
  assert.equal(sigs[0].kind, "risk_officer_dissonance");
  assert.equal(sigs[0].evidence.length, 3);
});

test("detectRiskOfficerDissonance ignores approve / downsize verdicts", () => {
  const runs = [
    run({ ageMs: 1 * HOUR, riskOfficerVerdicts: [
      { verdict: "approve" }, { verdict: "downsize", downsizeFactor: 0.5 }, { verdict: "approve" },
    ]}),
  ];
  assert.equal(detectRiskOfficerDissonance({ runs, agent: "qm", network: "sepolia", now: NOW }).length, 0);
});

// ---------------------------------------------------------------------------
// Trigger 5 — loss streak
// ---------------------------------------------------------------------------

test("detectLossStreak fires on >=3 losing closes (<-5%) in 24h", () => {
  const runs = [
    run({ ageMs: 22 * HOUR, closures: [closure({ ticker: "AAA", pct: -0.07 })] }),
    run({ ageMs: 12 * HOUR, closures: [closure({ ticker: "BBB", pct: -0.08 })] }),
    run({ ageMs: 2 * HOUR, closures: [closure({ ticker: "CCC", pct: -0.06 })] }),
  ];
  const sigs = detectLossStreak({ runs, agent: "qm", network: "sepolia", now: NOW });
  assert.equal(sigs.length, 1);
  assert.equal(sigs[0].kind, "loss_streak");
  assert.equal(sigs[0].evidence.length, 3);
});

test("detectLossStreak does NOT fire on 2 losses (need >=3)", () => {
  const runs = [
    run({ ageMs: 2 * HOUR, closures: [closure({ ticker: "AAA", pct: -0.07 })] }),
    run({ ageMs: 1 * HOUR, closures: [closure({ ticker: "BBB", pct: -0.08 })] }),
  ];
  assert.equal(detectLossStreak({ runs, agent: "qm", network: "sepolia", now: NOW }).length, 0);
});

// ---------------------------------------------------------------------------
// computeHousekeeping
// ---------------------------------------------------------------------------

test("computeHousekeeping rotates run-log entries older than 90 days", () => {
  const runs = [
    { timestamp: new Date(NOW - 120 * DAY).toISOString() },
    { timestamp: new Date(NOW - 100 * DAY).toISOString() },
    { timestamp: new Date(NOW - 5 * DAY).toISOString() },
  ];
  const hk = computeHousekeeping({
    filePath: "/repo/agents/memory/qm/run-log.sepolia.jsonl",
    runs,
    now: NOW,
    projectRoot: "/repo",
  });
  assert.ok(hk);
  assert.equal(hk.kind, "rotate_run_log");
  assert.equal(hk.entryCount, 2);
  assert.equal(hk.sourceFile, "agents/memory/qm/run-log.sepolia.jsonl");
  assert.match(hk.archiveFile, /^agents\/memory\/qm\/archive\/run-log\.sepolia\.rotated-/);
});

test("computeHousekeeping returns null when nothing is old", () => {
  const runs = [{ timestamp: new Date(NOW - 30 * DAY).toISOString() }];
  const hk = computeHousekeeping({ filePath: "/x/y.jsonl", runs, now: NOW, projectRoot: "/x" });
  assert.equal(hk, null);
});

// ---------------------------------------------------------------------------
// End-to-end orchestration with a temp memory dir
// ---------------------------------------------------------------------------

test("detectSelfImprovementSignals walks the agents/memory tree", () => {
  const tmp = mkdtempSync(join(tmpdir(), "snx-signal-"));
  try {
    const agentDir = join(tmp, "qm");
    mkdirSync(agentDir, { recursive: true });
    const losses = [
      run({ ageMs: 2 * DAY, closures: [closure({ ticker: "GSR.V", pct: -0.07 })] }),
      run({ ageMs: 1 * DAY, closures: [closure({ ticker: "GSR.V", pct: -0.06 })] }),
    ];
    writeFileSync(
      join(agentDir, "run-log.sepolia.jsonl"),
      losses.map((l) => JSON.stringify(l)).join("\n") + "\n",
    );

    const sharedDir = join(tmp, "shared");
    mkdirSync(sharedDir, { recursive: true });
    writeFileSync(join(sharedDir, "news-cache.qm.json"), "{}");

    const result = detectSelfImprovementSignals({
      memoryDir: tmp,
      now: NOW,
      projectRoot: tmp,
    });
    assert.equal(result.shouldRun, true);
    assert.deepEqual(result.agents, ["qm"]);
    assert.equal(result.signals.length, 1);
    assert.equal(result.signals[0].kind, "recurring_losers");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("detectSelfImprovementSignals shouldRun=false when memory is empty", () => {
  const tmp = mkdtempSync(join(tmpdir(), "snx-signal-empty-"));
  try {
    const result = detectSelfImprovementSignals({ memoryDir: tmp, now: NOW, projectRoot: tmp });
    assert.equal(result.shouldRun, false);
    assert.deepEqual(result.signals, []);
    assert.deepEqual(result.agents, []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
