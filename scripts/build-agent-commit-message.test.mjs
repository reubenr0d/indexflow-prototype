import test from "node:test";
import assert from "node:assert/strict";
import { buildCommitMessage, __internals } from "./build-agent-commit-message.mjs";

const {
  SUBJECT_MAX,
  classifyStagedPaths,
  shortAddr,
  truncate,
  groupErrorsByCode,
  extractErrorCodeFromEntry,
} = __internals;

// ---------------------------------------------------------------------------
// Fixtures
//
// Shape mirrors what `publishAgentMetadata()` in scripts/agent-runner.mjs and
// `appendRunLog()` in the same file actually write — see the live samples in
// apps/web/public/agent-metadata/ and agents/memory/<agent>/run-log.*.jsonl.
// ---------------------------------------------------------------------------

const MINING_VAULT = "0x4dcd435461e27f8bfb580d216b8d69490023a0ba";
const QUALITY_VAULT = "0xbd7ea7e23ae07f0dd65e0738babf8864fdd741f3";
const RUN_ID = "2026-05-21T16:02:37.227Z";

function miningMetadataFixture({ withTxOnAllWires = false } = {}) {
  return JSON.stringify({
    isAiManaged: true,
    agentName: "mining-manager",
    agentDescription: "Mining-focused long/short vault driven by the Atlas ML engine and live news context",
    signalSource: "atlas-ml",
    entryMode: "ml_score",
    thesis: "Atlas ML favours diversified metals + gold.",
    lastRunAt: RUN_ID,
    latestRun: {
      runId: RUN_ID,
      finishedAt: RUN_ID,
      summary:
        "Despite attempts to open long positions on Amarc Resources Ltd. (AHR.V), Gold Strike Resources Corp. (GSR.V), and Power Metals Corp. (PWM.V) with minimal sizing and collateral, the transactions continue to fail due to insufficient capital for collateral.",
    },
    recentActions: [
      {
        tool: "wire_asset",
        justification: "Wiring Critical Metals Corp. (CRML) as a new entrant with a high ML score and predicted return.",
        timestamp: RUN_ID,
        txHash: "0xc2f362c18e080f206191b2686b13d60f6d956e1f4af8c186c029c7d2b2737d69",
        agentName: "mining-manager",
        runId: RUN_ID,
      },
      {
        tool: "wire_asset",
        justification: "Wiring Freeport-McMoRan Inc. (0R2O.L) as a new entrant with a high ML score and predicted return.",
        timestamp: RUN_ID,
        txHash: withTxOnAllWires ? "0xdeadbeef" : null,
        agentName: "mining-manager",
        runId: RUN_ID,
      },
      {
        tool: "set_vault_assets",
        justification: "Updating tracked assets to match the latest Atlas ML top picks, including newly wired Critical Metals Corp. (CRML).",
        timestamp: RUN_ID,
        txHash: "0x7021b3645515544ec4c858b6f6915748052f85349a822db30a05cdecd983de7e",
        agentName: "mining-manager",
        runId: RUN_ID,
      },
      {
        tool: "allocate_to_perp",
        justification: "Allocating capital to match the auto-target for new long positions on top-N Atlas picks.",
        timestamp: RUN_ID,
        txHash: null,
        agentName: "mining-manager",
        runId: RUN_ID,
      },
      {
        tool: "open_position",
        justification: "Opening long position on Amarc Resources Ltd. (AHR.V) based on high ML score and predicted return.",
        timestamp: RUN_ID,
        txHash: null,
        agentName: "mining-manager",
        runId: RUN_ID,
      },
      // Stale action from a previous run — must be ignored because runId differs.
      {
        tool: "create_vault",
        justification: "Old creation row from a previous run.",
        timestamp: "2026-05-20T00:00:00.000Z",
        txHash: "0xstale",
        agentName: "mining-manager",
        runId: "2026-05-20T00:00:00.000Z",
      },
    ],
  });
}

function qualityMetadataFixture() {
  return JSON.stringify({
    isAiManaged: true,
    agentName: "quality-matrix-manager",
    agentDescription: "Mining long/short vault driven by the analyst's 8-category Quality Matrix",
    signalSource: "atlas-quality",
    entryMode: "quality_score",
    thesis: null,
    lastRunAt: "2026-05-21T13:26:49.516Z",
    latestRun: {
      runId: "2026-05-21T13:26:49.516Z",
      finishedAt: "2026-05-21T13:26:49.516Z",
      summary:
        "It seems there was an error while attempting to allocate capital to the perp module. The transaction reverted due to a requirement for a specific amount.",
    },
    recentActions: [
      { tool: "create_vault", justification: "Initial creation of the Minestarters Quality Matrix vault.", timestamp: "2026-05-21T13:26:49.516Z", txHash: "0x47be", agentName: "quality-matrix-manager", runId: "2026-05-21T13:26:49.516Z" },
      { tool: "wire_asset", justification: "Wiring AYM.AX as it is a top pick with an exceptional composite score of 90.", timestamp: "2026-05-21T13:26:49.516Z", txHash: "0xe2f0", agentName: "quality-matrix-manager", runId: "2026-05-21T13:26:49.516Z" },
      { tool: "wire_asset", justification: "Wiring CGNT.V as it is a top pick with an exceptional composite score of 90.", timestamp: "2026-05-21T13:26:49.516Z", txHash: "0x548f", agentName: "quality-matrix-manager", runId: "2026-05-21T13:26:49.516Z" },
      { tool: "wire_asset", justification: "Wiring LGC.V as it is a top pick with an exceptional composite score of 90.", timestamp: "2026-05-21T13:26:49.516Z", txHash: "0x6df3", agentName: "quality-matrix-manager", runId: "2026-05-21T13:26:49.516Z" },
      { tool: "wire_asset", justification: "Wiring OOR.V as it is a top pick with a strong composite score of 80.", timestamp: "2026-05-21T13:26:49.516Z", txHash: "0xb1a9", agentName: "quality-matrix-manager", runId: "2026-05-21T13:26:49.516Z" },
      { tool: "wire_asset", justification: "Wiring GSR.V as it is a top pick with a strong composite score of 80.", timestamp: "2026-05-21T13:26:49.516Z", txHash: null, agentName: "quality-matrix-manager", runId: "2026-05-21T13:26:49.516Z" },
      { tool: "set_vault_assets", justification: "Setting tracked assets to match the top picks from the Quality Matrix.", timestamp: "2026-05-21T13:26:49.516Z", txHash: "0x5df9", agentName: "quality-matrix-manager", runId: "2026-05-21T13:26:49.516Z" },
      { tool: "allocate_to_perp", justification: "Allocating capital to the perp module to enable opening of long positions on top picks.", timestamp: "2026-05-21T13:26:49.516Z", txHash: null, agentName: "quality-matrix-manager", runId: "2026-05-21T13:26:49.516Z" },
    ],
  });
}

function runLogFixture({
  agent,
  network = "sepolia",
  turns = 12,
  errors = [],
  softFailures = [],
  vault = null,
  skippedWrites = 0,
  summary = "",
}) {
  const writeActions = [];
  for (let i = 0; i < skippedWrites; i++) {
    writeActions.push({ tool: "open_position", args: {}, skipped: true });
  }
  const entry = {
    timestamp: "2026-05-21T16:02:37.227Z",
    agent,
    network,
    vault,
    turns,
    toolCalls: [],
    writeActions,
    confirmationBatches: [],
    errors,
    softFailures,
    summary,
  };
  return `${JSON.stringify(entry)}\n`;
}

function makeReadFile(map) {
  return (path) => (path in map ? map[path] : null);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("buildCommitMessage: two agents with mixed actions produces a structured subject + body", () => {
  const metaMining = `apps/web/public/agent-metadata/${MINING_VAULT}.json`;
  const metaQuality = `apps/web/public/agent-metadata/${QUALITY_VAULT}.json`;
  const logMining = "agents/memory/mining-manager/run-log.sepolia.jsonl";
  const logQuality = "agents/memory/quality-matrix-manager/run-log.sepolia.jsonl";

  const { subject, body } = buildCommitMessage({
    stagedMetadataPaths: [metaMining, metaQuality],
    stagedRunLogPaths: [logMining, logQuality],
    stagedStatePaths: [],
    readFile: makeReadFile({
      [metaMining]: miningMetadataFixture(),
      [metaQuality]: qualityMetadataFixture(),
      [logMining]: runLogFixture({ agent: "mining-manager", turns: 12, vault: MINING_VAULT, summary: "Despite attempts…" }),
      [logQuality]: runLogFixture({ agent: "quality-matrix-manager", turns: 18, vault: QUALITY_VAULT, summary: "It seems there was an error…" }),
    }),
  });

  assert.ok(subject.startsWith("memory(agent): "), `subject should be conventional: ${subject}`);
  assert.ok(subject.length <= SUBJECT_MAX, `subject ${subject.length}>72: ${subject}`);
  assert.ok(subject.includes("mining-manager"), `subject mentions mining-manager: ${subject}`);
  assert.ok(subject.includes("quality-matrix-manager"), `subject mentions quality-matrix-manager: ${subject}`);

  assert.ok(body.includes(shortAddr(MINING_VAULT)), "body includes short mining vault address");
  assert.ok(body.includes(shortAddr(QUALITY_VAULT)), "body includes short quality vault address");
  assert.ok(body.includes("sepolia"), "body includes network");
  assert.ok(body.includes("12 turns"), "body includes mining turn count");
  assert.ok(body.includes("18 turns"), "body includes quality turn count");
  assert.ok(body.includes("wire_asset"), "body lists wire_asset action group");
  assert.ok(body.includes("create_vault"), "body lists create_vault for quality agent");
  assert.ok(body.includes("(no tx)"), "body marks unconfirmed actions");
  assert.ok(body.includes("Summary:"), "body includes a summary line");
  assert.ok(
    body.includes("Wiring Critical Metals Corp. (CRML)") ||
      body.includes("Wiring AYM.AX"),
    "body includes at least one justification",
  );
  assert.ok(body.includes("Run finished:"), "body ends with run-finished line");

  // Stale create_vault from a previous run must not leak into the subject.
  assert.ok(!subject.includes("created vault"), `subject should NOT include stale create_vault from mining-manager: ${subject}`);
});

test("buildCommitMessage: empty input falls back to memory-only or default subject", () => {
  const refreshOnly = buildCommitMessage({
    stagedMetadataPaths: [],
    stagedRunLogPaths: [],
    stagedStatePaths: ["agents/memory/mining-manager/state.json"],
    readFile: () => null,
    now: () => "2026-05-22T00:00:00.000Z",
  });
  assert.equal(refreshOnly.subject, "memory(agent): refresh memory only");
  assert.ok(refreshOnly.body.includes("Run finished: 2026-05-22T00:00:00.000Z"));

  const nothingChanged = buildCommitMessage({
    readFile: () => null,
    now: () => "2026-05-22T00:00:00.000Z",
  });
  assert.equal(nothingChanged.subject, "memory(agent): update agent memory and metadata");
});

test("buildCommitMessage: failed agent (zero actions, errors) renders FAILED in subject", () => {
  const logFailed = "agents/memory/mining-manager/run-log.sepolia.jsonl";
  const { subject, body } = buildCommitMessage({
    stagedMetadataPaths: [],
    stagedRunLogPaths: [logFailed],
    stagedStatePaths: [],
    readFile: makeReadFile({
      [logFailed]: runLogFixture({
        agent: "mining-manager",
        turns: 3,
        errors: [
          { tool: "_vault_identity", error: "[VAULT IDENTITY] Refusing to run: state.json points at 0xabc whose on-chain name is …" },
          { tool: "create_vault", error: "MCP error" },
          { tool: "open_position", error: "insufficient collateral" },
        ],
        vault: MINING_VAULT,
        summary: "FAILED: vault identity check did not pass.",
      }),
    }),
  });

  assert.ok(subject.includes("mining-manager FAILED (3 errors)"), `subject should mark failure: ${subject}`);
  assert.ok(subject.length <= SUBJECT_MAX);
  assert.ok(body.includes("3 errors"), "body header includes error count");
  assert.ok(body.includes("Errors: 3"), "body labels the error block");
  // Free-text errors with no error_code still get grouped under "(no error_code)".
  assert.ok(
    body.includes("(no error_code)"),
    "body emits one bucket per distinct code (or 'no error_code')",
  );
});

test("buildCommitMessage: body groups errors by error_code, surfaces revert alongside churn", () => {
  // Regression for ab42c05 where the commit body only showed the first
  // yfinance_news validation error, completely hiding three on-chain
  // REQUIRE_REVERTs behind a bare "Errors: 8" count.
  const logPath = "agents/memory/mining-manager/run-log.sepolia.jsonl";
  const errs = [
    { tool: "yfinance_news", error: "MCP error -32602: Input validation error" },
    {
      tool: "open_position",
      errorCode: "REQUIRE_REVERT",
      error: JSON.stringify({
        success: false,
        error_code: "REQUIRE_REVERT",
        message: "Contract reverted with require(string): Vault: _size must be more than _collateral",
      }),
    },
    {
      tool: "open_position",
      errorCode: "REQUIRE_REVERT",
      error: JSON.stringify({
        success: false,
        error_code: "REQUIRE_REVERT",
        message: "Contract reverted with require(string): Vault: _size must be more than _collateral",
      }),
    },
    {
      tool: "open_position",
      errorCode: "REQUIRE_REVERT",
      error: JSON.stringify({
        success: false,
        error_code: "REQUIRE_REVERT",
        message: "Contract reverted with require(string): Vault: _size must be more than _collateral",
      }),
    },
  ];
  const { subject, body } = buildCommitMessage({
    stagedMetadataPaths: [],
    stagedRunLogPaths: [logPath],
    stagedStatePaths: [],
    readFile: makeReadFile({
      [logPath]: runLogFixture({
        agent: "mining-manager",
        turns: 12,
        errors: errs,
        vault: MINING_VAULT,
      }),
    }),
  });

  assert.ok(subject.includes("mining-manager FAILED (4 errors)"), `subject: ${subject}`);
  assert.ok(body.includes("Errors: 4"), "body header still shows total count");
  assert.ok(
    body.includes("REQUIRE_REVERT × 3"),
    "body must group reverts so 3 of them aren't hidden behind the first single yfinance error",
  );
  assert.ok(
    body.includes("Vault: _size must be more than _collateral"),
    "body must include the actual revert message, not just the count",
  );
  assert.ok(
    body.includes("(no error_code) × 1"),
    "free-text errors (no error_code) still get a row so they aren't dropped",
  );
});

test("buildCommitMessage: soft refusals render as a tally line, do NOT inflate FAILED count", () => {
  const logPath = "agents/memory/mining-manager/run-log.sepolia.jsonl";
  const { subject, body } = buildCommitMessage({
    stagedMetadataPaths: [],
    stagedRunLogPaths: [logPath],
    stagedStatePaths: [],
    readFile: makeReadFile({
      [logPath]: runLogFixture({
        agent: "mining-manager",
        turns: 8,
        errors: [], // zero hard errors
        softFailures: [
          { tool: "plan_open_position", errorCode: "CHURN_GUARD_COOLDOWN", error: "{}" },
          { tool: "plan_open_position", errorCode: "CHURN_GUARD_COOLDOWN", error: "{}" },
          { tool: "plan_open_position", errorCode: "CHURN_GUARD_COOLDOWN", error: "{}" },
          { tool: "wire_asset", errorCode: "ALREADY_WIRED", error: "{}" },
        ],
        vault: MINING_VAULT,
      }),
    }),
  });

  assert.ok(
    !subject.includes("FAILED"),
    `soft-only runs must NOT be marked FAILED: ${subject}`,
  );
  assert.ok(body.includes("Soft refusals: 4"), "body surfaces the soft tally explicitly");
  assert.ok(
    body.includes("CHURN_GUARD_COOLDOWN:3"),
    "soft tally breaks down counts by code so the dominant refusal is visible",
  );
  assert.ok(body.includes("ALREADY_WIRED:1"));
});

test("extractErrorCodeFromEntry: prefers explicit errorCode field, falls back to regex", () => {
  assert.equal(
    extractErrorCodeFromEntry({ errorCode: "REQUIRE_REVERT", error: "{}" }),
    "REQUIRE_REVERT",
    "explicit errorCode field wins (preferred path for entries written by the modern runner)",
  );
  assert.equal(
    extractErrorCodeFromEntry({ error: '{"success":false,"error_code":"CHURN_GUARD_COOLDOWN"}' }),
    "CHURN_GUARD_COOLDOWN",
    "regex fallback works on older log entries that pre-date the errorCode field",
  );
  assert.equal(extractErrorCodeFromEntry({ error: "MCP error -32603: Internal error" }), null);
  assert.equal(extractErrorCodeFromEntry(null), null);
});

test("groupErrorsByCode: sorts by count desc, then code asc, for deterministic output", () => {
  const grouped = groupErrorsByCode([
    { tool: "a", errorCode: "Z_CODE", error: "{}" },
    { tool: "b", errorCode: "A_CODE", error: "{}" },
    { tool: "c", errorCode: "A_CODE", error: "{}" },
    { tool: "d", error: "untyped" },
  ]);
  assert.equal(grouped[0].code, "A_CODE", "most-frequent first");
  assert.equal(grouped[0].count, 2);
  // The two singletons sort by code asc; (no error_code) sorts as "(" which precedes letters.
  assert.equal(grouped[1].code, null, "untyped errors sort first alphabetically due to '(' bucket key");
  assert.equal(grouped[2].code, "Z_CODE");
});

test("buildCommitMessage: mixed long+short opens render as 'opened L long + S short'", () => {
  const META = "apps/web/public/agent-metadata/0x1111111111111111111111111111111111111111.json";
  const meta = JSON.stringify({
    agentName: "mixed-agent",
    lastRunAt: RUN_ID,
    latestRun: { runId: RUN_ID, finishedAt: RUN_ID, summary: "Mixed long/short batch." },
    recentActions: [
      { tool: "open_position", justification: "Opening long position on FOO based on signal.", timestamp: RUN_ID, txHash: null, agentName: "mixed-agent", runId: RUN_ID },
      { tool: "open_position", justification: "Opening long position on BAR based on signal.", timestamp: RUN_ID, txHash: null, agentName: "mixed-agent", runId: RUN_ID },
      { tool: "open_position", justification: "Opening short position on BAZ — bearish news.", timestamp: RUN_ID, txHash: null, agentName: "mixed-agent", runId: RUN_ID },
    ],
  });

  const { subject } = buildCommitMessage({
    stagedMetadataPaths: [META],
    stagedRunLogPaths: [],
    stagedStatePaths: [],
    readFile: makeReadFile({ [META]: meta }),
  });

  assert.ok(
    subject.includes("opened 2 long + 1 short"),
    `subject should describe mixed direction: ${subject}`,
  );
});

test("buildCommitMessage: oversized subjects are truncated with ellipsis", () => {
  const paths = [];
  const files = {};
  for (let i = 0; i < 5; i++) {
    const addr = "0x" + "ab".repeat(20).slice(0, 40);
    const p = `apps/web/public/agent-metadata/${addr.slice(0, 38)}${i}${i}.json`;
    paths.push(p);
    files[p] = JSON.stringify({
      agentName: `agent-with-a-very-long-name-${i}`,
      lastRunAt: RUN_ID,
      latestRun: { runId: RUN_ID, finishedAt: RUN_ID, summary: "" },
      recentActions: [
        { tool: "wire_asset", justification: "x", timestamp: RUN_ID, txHash: "0x1", agentName: `agent-with-a-very-long-name-${i}`, runId: RUN_ID },
      ],
    });
  }

  const { subject } = buildCommitMessage({
    stagedMetadataPaths: paths,
    stagedRunLogPaths: [],
    stagedStatePaths: [],
    readFile: makeReadFile(files),
  });

  assert.ok(subject.length <= SUBJECT_MAX, `subject ${subject.length}>72: ${subject}`);
  assert.ok(subject.endsWith("..."), `oversized subject should end with ellipsis: ${subject}`);
});

test("classifyStagedPaths routes metadata / run-log / state correctly and ignores noise", () => {
  const { metadata, runLogs, stateFiles } = classifyStagedPaths([
    `apps/web/public/agent-metadata/${MINING_VAULT}.json`,
    "apps/web/public/agent-metadata/README.md",
    "apps/web/public/agent-metadata/.gitkeep",
    "agents/memory/mining-manager/run-log.sepolia.jsonl",
    "agents/memory/mining-manager/run-log.fuji.jsonl",
    "agents/memory/quality-matrix-manager/state.json",
    "agents/memory/quality-matrix-manager/archive/run-log.sepolia.jsonl.2026-05-21.deployment",
    "scripts/agent-runner.mjs",
  ]);

  assert.deepEqual(metadata, [`apps/web/public/agent-metadata/${MINING_VAULT}.json`]);
  assert.deepEqual(runLogs, [
    "agents/memory/mining-manager/run-log.sepolia.jsonl",
    "agents/memory/mining-manager/run-log.fuji.jsonl",
  ]);
  assert.deepEqual(stateFiles, ["agents/memory/quality-matrix-manager/state.json"]);
});

test("truncate and shortAddr helpers behave defensively", () => {
  assert.equal(shortAddr(MINING_VAULT), "0x4dcd…0ba");
  assert.equal(shortAddr(null), "(unknown)");
  assert.equal(shortAddr("0x1234"), "0x1234");
  assert.equal(truncate("hello world", 5), "hell…");
  assert.equal(truncate("hello", 50), "hello");
  assert.equal(truncate(undefined, 10), "");
});

test("buildCommitMessage: missing readFile throws", () => {
  assert.throws(() => buildCommitMessage({}), /requires a readFile/);
});
