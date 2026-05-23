#!/usr/bin/env node

// Deterministic, free pre-check that decides whether the `self-improver`
// meta-agent should run on this CI tick. Reads the tail of every
// `agents/memory/<agent>/run-log.<network>.jsonl` and looks for the five
// trigger conditions described in
// `.cursor/plans/self-improving_vault_agent_via_prs_*.plan.md` Layer A:
//
//   1. recurring_losers   — same ticker closed at < -5% PnL of collateral
//                            twice or more inside the last 7 days
//   2. new_error_code     — an MCP `error_code` that did NOT appear in
//                            the prior 100 runs (excluding the recent
//                            window itself)
//   3. cap_saturation     — `maxNewPositionsPerRun` or
//                            `maxNewShortsPerRun` hit on >= 3 consecutive
//                            most-recent runs
//   4. risk_officer_dissonance — >= 3 risk-officer veto verdicts on the
//                            same vault in the last 24 hours
//   5. loss_streak        — >= 3 closed positions with < -5% PnL of
//                            collateral in the last 24 hours
//
// The script is pure (file IO only, no network, no LLM, no shell-out)
// so it has direct unit tests under
// `scripts/detect-self-improvement-signal.test.mjs`.
//
// Output (stdout, JSON):
//   {
//     shouldRun: boolean,
//     agents: string[],                    // distinct agents the signals touch
//     signals: Array<{
//       id: string,                        // stable hash of (kind, agent, key)
//       kind: "recurring_losers" | "new_error_code" | ...,
//       agent: string,
//       network: string,
//       evidence: object[],                // raw run-log entries cited
//       summary: string,                   // human-readable one-liner
//     }>,
//     housekeeping: Array<{
//       kind: "rotate_run_log",
//       agent: string,
//       network: string,
//       sourceFile: string,                // relative path
//       archiveFile: string,               // relative path under archive/
//       cutoffMs: number,
//       entryCount: number,                // entries that would be rotated
//     }>,
//   }
//
// CLI flags (all optional, mostly for tests):
//   --memory-dir <path>   Override agents/memory root (default = repo)
//   --now <iso>           Pin "now" for deterministic tests
//   --max-tail <n>        Override per-log tail size (default 200)

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

const DEFAULT_MAX_TAIL = 200;
const RECURRING_LOSER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const RECURRING_LOSER_THRESHOLD_PCT = -0.05;
const RECURRING_LOSER_MIN_COUNT = 2;
const NEW_ERROR_CODE_HISTORY_WINDOW = 100; // entries to scan for "seen before"
const NEW_ERROR_CODE_RECENT_WINDOW = 10; // recent entries that count as "now"
const CAP_SATURATION_RUN_COUNT = 3;
const RISK_OFFICER_VETO_WINDOW_MS = 24 * 60 * 60 * 1000;
const RISK_OFFICER_VETO_MIN_COUNT = 3;
const LOSS_STREAK_WINDOW_MS = 24 * 60 * 60 * 1000;
const LOSS_STREAK_MIN_COUNT = 3;
const HOUSEKEEPING_RUN_LOG_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Run-log discovery
// ---------------------------------------------------------------------------

export function discoverRunLogs(memoryRoot) {
  const out = [];
  if (!existsSync(memoryRoot)) return out;
  let agents;
  try {
    agents = readdirSync(memoryRoot, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of agents) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "shared" || entry.name === "archive") continue;
    const agentDir = join(memoryRoot, entry.name);
    let files;
    try {
      files = readdirSync(agentDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.isFile()) continue;
      const m = f.name.match(/^run-log\.(.+)\.jsonl$/);
      if (!m) continue;
      out.push({
        agent: entry.name,
        network: m[1],
        path: join(agentDir, f.name),
      });
    }
  }
  return out;
}

export function readRunLogTail(filePath, maxTail = DEFAULT_MAX_TAIL) {
  if (!existsSync(filePath)) return [];
  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return [];
  }
  const lines = raw.split("\n").filter((l) => l.trim());
  const tail = lines.slice(-maxTail);
  const out = [];
  for (const line of tail) {
    try {
      out.push(JSON.parse(line));
    } catch {
      // ignore corrupt line — same approach as readRecentRunLog in agent-runner
    }
  }
  return out;
}

export function readRunLogAll(filePath) {
  if (!existsSync(filePath)) return [];
  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return [];
  }
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Signal helpers
// ---------------------------------------------------------------------------

function signalId(parts) {
  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex").slice(0, 12);
}

function parseTs(raw) {
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

// Returns the most recent `closedPositions[]` entries across the tail, each
// annotated with `runTimestamp` (the parent run's timestamp) so the caller
// can window without re-keying.
function flattenClosedPositions(runs) {
  const out = [];
  for (const run of runs) {
    const list = Array.isArray(run?.closedPositions) ? run.closedPositions : [];
    for (const closure of list) {
      if (!closure) continue;
      out.push({
        ...closure,
        runTimestamp: run.timestamp || null,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Trigger 1 — recurring losers
// ---------------------------------------------------------------------------

export function detectRecurringLosers({ runs, agent, network, now }) {
  const closures = flattenClosedPositions(runs);
  const cutoff = now - RECURRING_LOSER_WINDOW_MS;
  const byTicker = new Map();
  for (const c of closures) {
    const tsMs = parseTs(c.closedAt) || parseTs(c.runTimestamp);
    if (!Number.isFinite(tsMs) || tsMs < cutoff) continue;
    const pct = Number(c.realizedPnlPctOfCollateral);
    if (!Number.isFinite(pct) || pct >= RECURRING_LOSER_THRESHOLD_PCT) continue;
    const ticker = String(c.ticker || c.assetId || "").trim();
    if (!ticker) continue;
    const key = `${ticker}:${c.side || "?"}`;
    if (!byTicker.has(key)) byTicker.set(key, []);
    byTicker.get(key).push({ ...c, _tsMs: tsMs });
  }
  const signals = [];
  for (const [key, list] of byTicker.entries()) {
    if (list.length < RECURRING_LOSER_MIN_COUNT) continue;
    list.sort((a, b) => b._tsMs - a._tsMs);
    const evidence = list.slice(0, 5).map((c) => ({
      ticker: c.ticker || null,
      side: c.side || null,
      closedAt: c.closedAt || null,
      realizedPnlPctOfCollateral: c.realizedPnlPctOfCollateral ?? null,
      closeJustification: c.closeJustification || null,
      closedReason: c.closedReason || null,
      entryJustification: c.entryJustification || null,
      entryTimestamp: c.entryTimestamp || null,
      entryTxHash: c.entryTxHash || null,
    }));
    const worst = list.reduce((m, c) => (c.realizedPnlPctOfCollateral < m ? c.realizedPnlPctOfCollateral : m), 0);
    signals.push({
      id: signalId(["recurring_losers", agent, key]),
      kind: "recurring_losers",
      agent,
      network,
      evidence,
      summary: `${list.length} losing closes on ${key} in the last 7 days (worst ${(worst * 100).toFixed(1)}%)`,
    });
  }
  return signals;
}

// ---------------------------------------------------------------------------
// Trigger 2 — new error_code
// ---------------------------------------------------------------------------

export function detectNewErrorCodes({ runs, agent, network }) {
  const total = runs.length;
  if (total === 0) return [];
  const recentStart = Math.max(0, total - NEW_ERROR_CODE_RECENT_WINDOW);
  const historyEnd = recentStart;
  const historyStart = Math.max(0, historyEnd - NEW_ERROR_CODE_HISTORY_WINDOW);

  const historicalCodes = new Set();
  for (let i = historyStart; i < historyEnd; i++) {
    const run = runs[i];
    const errs = Array.isArray(run?.errors) ? run.errors : [];
    for (const e of errs) {
      const code = extractErrorCode(e?.error || e);
      if (code) historicalCodes.add(code);
    }
  }

  const seenInRecent = new Map(); // code -> [{ runTimestamp, tool, error }]
  for (let i = recentStart; i < total; i++) {
    const run = runs[i];
    const errs = Array.isArray(run?.errors) ? run.errors : [];
    for (const e of errs) {
      const code = extractErrorCode(e?.error || e);
      if (!code) continue;
      if (historicalCodes.has(code)) continue;
      if (!seenInRecent.has(code)) seenInRecent.set(code, []);
      seenInRecent.get(code).push({
        runTimestamp: run.timestamp || null,
        tool: e?.tool || null,
        error: typeof e?.error === "string" ? e.error.slice(0, 400) : null,
      });
    }
  }

  const signals = [];
  for (const [code, occurrences] of seenInRecent.entries()) {
    signals.push({
      id: signalId(["new_error_code", agent, code]),
      kind: "new_error_code",
      agent,
      network,
      evidence: occurrences.slice(0, 5),
      summary: `New MCP error_code "${code}" appeared ${occurrences.length}x in the last ${NEW_ERROR_CODE_RECENT_WINDOW} runs (not seen in prior ${NEW_ERROR_CODE_HISTORY_WINDOW})`,
    });
  }
  return signals;
}

export function extractErrorCode(errLike) {
  if (!errLike) return null;
  if (typeof errLike === "string") {
    // Match `"error_code":"NAME_HERE"` or `error_code: NAME_HERE`
    const jsonMatch = errLike.match(/"error_code"\s*:\s*"([A-Z][A-Z0-9_]+)"/);
    if (jsonMatch) return jsonMatch[1];
    const looseMatch = errLike.match(/error_code\s*[:=]\s*"?([A-Z][A-Z0-9_]+)"?/);
    if (looseMatch) return looseMatch[1];
    return null;
  }
  if (typeof errLike === "object") {
    if (typeof errLike.error_code === "string") return errLike.error_code;
    if (typeof errLike.error === "string") return extractErrorCode(errLike.error);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Trigger 3 — cap saturation
// ---------------------------------------------------------------------------

export function detectCapSaturation({ runs, agent, network }) {
  if (runs.length < CAP_SATURATION_RUN_COUNT) return [];
  const tail = runs.slice(-CAP_SATURATION_RUN_COUNT);
  const allSaturated = tail.every((run) => runWasCapSaturated(run));
  if (!allSaturated) return [];
  return [
    {
      id: signalId(["cap_saturation", agent, tail[0].timestamp || ""]),
      kind: "cap_saturation",
      agent,
      network,
      evidence: tail.map((r) => ({
        runTimestamp: r.timestamp || null,
        openPositionCount: countSuccessfulOpens(r),
        summary: typeof r.summary === "string" ? r.summary.slice(0, 200) : null,
      })),
      summary: `Position-cap saturation on ${CAP_SATURATION_RUN_COUNT} consecutive runs (every run filled maxNewPositionsPerRun) — frontmatter may be miscalibrated`,
    },
  ];
}

function runWasCapSaturated(run) {
  const opens = countSuccessfulOpens(run);
  if (opens === 0) return false;
  // Without the policy frontmatter to compare against we use a heuristic:
  // every successful open_position counts, and we treat "cap_saturation"
  // as "the run successfully opened >=1 position AND >=1 of those was
  // also rejected with a cap error_code". The conservative variant is
  // "every successful open AND any cap-related error in the same run".
  const errs = Array.isArray(run.errors) ? run.errors : [];
  return errs.some((e) => {
    const code = extractErrorCode(e?.error || e);
    return code === "MAX_POSITIONS_PER_RUN_EXCEEDED" || code === "MAX_SHORTS_PER_RUN_EXCEEDED";
  });
}

function countSuccessfulOpens(run) {
  const actions = Array.isArray(run?.writeActions) ? run.writeActions : [];
  let n = 0;
  for (const a of actions) {
    if (a?.tool === "open_position" && !a.skipped && !a.failed) n += 1;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Trigger 4 — risk-officer dissonance
// ---------------------------------------------------------------------------

export function detectRiskOfficerDissonance({ runs, agent, network, now }) {
  const cutoff = now - RISK_OFFICER_VETO_WINDOW_MS;
  const byVault = new Map();
  for (const run of runs) {
    const tsMs = parseTs(run.timestamp);
    if (!Number.isFinite(tsMs) || tsMs < cutoff) continue;
    const vault = run.vault || "_unknown_";
    const verdicts = Array.isArray(run.riskOfficerVerdicts) ? run.riskOfficerVerdicts : [];
    for (const v of verdicts) {
      if (String(v?.verdict || "").toLowerCase() !== "veto") continue;
      if (!byVault.has(vault)) byVault.set(vault, []);
      byVault.get(vault).push({
        runTimestamp: run.timestamp || null,
        vault,
        reason: typeof v?.reason === "string" ? v.reason.slice(0, 400) : null,
      });
    }
  }
  const signals = [];
  for (const [vault, vetoes] of byVault.entries()) {
    if (vetoes.length < RISK_OFFICER_VETO_MIN_COUNT) continue;
    signals.push({
      id: signalId(["risk_officer_dissonance", agent, vault]),
      kind: "risk_officer_dissonance",
      agent,
      network,
      evidence: vetoes.slice(0, 5),
      summary: `${vetoes.length} risk-officer vetoes on vault ${vault} in the last 24h — prompt isn't internalising the officer's rubric`,
    });
  }
  return signals;
}

// ---------------------------------------------------------------------------
// Trigger 5 — loss streak
// ---------------------------------------------------------------------------

export function detectLossStreak({ runs, agent, network, now }) {
  const cutoff = now - LOSS_STREAK_WINDOW_MS;
  const losses = [];
  for (const closure of flattenClosedPositions(runs)) {
    const tsMs = parseTs(closure.closedAt) || parseTs(closure.runTimestamp);
    if (!Number.isFinite(tsMs) || tsMs < cutoff) continue;
    const pct = Number(closure.realizedPnlPctOfCollateral);
    if (!Number.isFinite(pct) || pct >= RECURRING_LOSER_THRESHOLD_PCT) continue;
    losses.push({ ...closure, _tsMs: tsMs });
  }
  if (losses.length < LOSS_STREAK_MIN_COUNT) return [];
  losses.sort((a, b) => b._tsMs - a._tsMs);
  return [
    {
      id: signalId(["loss_streak", agent, String(Math.floor(losses[0]._tsMs / RECURRING_LOSER_WINDOW_MS))]),
      kind: "loss_streak",
      agent,
      network,
      evidence: losses.slice(0, 5).map((c) => ({
        ticker: c.ticker || null,
        side: c.side || null,
        closedAt: c.closedAt || null,
        realizedPnlPctOfCollateral: c.realizedPnlPctOfCollateral ?? null,
        closedReason: c.closedReason || null,
      })),
      summary: `${losses.length} losing closes (<-5%) in the last 24h — short-term drawdown, review entries`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Top-level orchestration
// ---------------------------------------------------------------------------

export function detectSignalsForAgent({ runs, agent, network, now }) {
  return [
    ...detectRecurringLosers({ runs, agent, network, now }),
    ...detectNewErrorCodes({ runs, agent, network }),
    ...detectCapSaturation({ runs, agent, network }),
    ...detectRiskOfficerDissonance({ runs, agent, network, now }),
    ...detectLossStreak({ runs, agent, network, now }),
  ];
}

export function computeHousekeeping({ filePath, runs, now, projectRoot }) {
  const cutoff = now - HOUSEKEEPING_RUN_LOG_MAX_AGE_MS;
  let oldCount = 0;
  for (const r of runs) {
    const tsMs = parseTs(r?.timestamp);
    if (Number.isFinite(tsMs) && tsMs < cutoff) oldCount += 1;
  }
  if (oldCount === 0) return null;
  const agentDir = dirname(filePath);
  const fileName = basename(filePath);
  const archiveBase = join(agentDir, "archive");
  const stamp = new Date(now).toISOString().replace(/[:.]/g, "-");
  const archivePath = join(archiveBase, `${fileName.replace(/\.jsonl$/, "")}.rotated-${stamp}.jsonl`);
  return {
    kind: "rotate_run_log",
    sourceFile: projectRoot ? relative(projectRoot, filePath) : filePath,
    archiveFile: projectRoot ? relative(projectRoot, archivePath) : archivePath,
    cutoffMs: cutoff,
    entryCount: oldCount,
  };
}

export function detectSelfImprovementSignals({
  memoryDir,
  now = Date.now(),
  maxTail = DEFAULT_MAX_TAIL,
  projectRoot,
} = {}) {
  const root = memoryDir || resolve(projectRoot || PROJECT_ROOT, "agents", "memory");
  const logs = discoverRunLogs(root);
  const allSignals = [];
  const housekeeping = [];
  const agentsTouched = new Set();
  for (const log of logs) {
    const runs = readRunLogTail(log.path, maxTail);
    const allRuns = readRunLogAll(log.path);
    const signals = detectSignalsForAgent({
      runs,
      agent: log.agent,
      network: log.network,
      now,
    });
    for (const s of signals) {
      agentsTouched.add(s.agent);
      allSignals.push(s);
    }
    const hk = computeHousekeeping({
      filePath: log.path,
      runs: allRuns,
      now,
      projectRoot: projectRoot || PROJECT_ROOT,
    });
    if (hk) housekeeping.push({ ...hk, agent: log.agent, network: log.network });
  }
  return {
    shouldRun: allSignals.length > 0,
    agents: Array.from(agentsTouched).sort(),
    signals: allSignals,
    housekeeping,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseCliArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--memory-dir") opts.memoryDir = argv[++i];
    else if (a === "--now") opts.now = Date.parse(argv[++i]);
    else if (a === "--max-tail") opts.maxTail = parseInt(argv[++i], 10);
    else if (a === "--project-root") opts.projectRoot = argv[++i];
  }
  return opts;
}

const isCli =
  typeof process !== "undefined" &&
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  const opts = parseCliArgs(process.argv.slice(2));
  const result = detectSelfImprovementSignals(opts);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
