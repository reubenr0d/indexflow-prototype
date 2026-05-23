#!/usr/bin/env node

/**
 * Build a structured git commit message summarising what the vault-agent
 * matrix did this CI tick.
 *
 * Consumed by the `commit-results` job in `.github/workflows/vault-agent.yml`.
 * The job pre-stages `agents/memory/` and `apps/web/public/agent-metadata/`
 * via `git add`; this script then walks `git diff --cached --name-only` and
 * synthesises a message from the already-redacted per-vault metadata files
 * (primary) and the per-agent run-log files (secondary, for turns / errors /
 * network).
 *
 * Usage (CLI):
 *   node scripts/build-agent-commit-message.mjs
 *
 * Exit codes:
 *   0  - message written to stdout (subject + blank line + body)
 *   1  - unrecoverable failure (e.g. git not available); workflow falls back
 *        to the static `memory(agent): update agent memory and metadata`.
 *
 * The pure `buildCommitMessage(...)` builder below is the unit-test seam
 * (see scripts/build-agent-commit-message.test.mjs).
 */

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const SUBJECT_MAX = 72;
const SUMMARY_MAX = 240;
const JUSTIFICATION_MAX = 110;
// Errors get a wider per-line budget than justifications because the
// structured payload is the most actionable piece of the commit body —
// hiding revert messages behind tight truncation was the whole reason the
// commit body was useless on `ab42c05`.
const ERROR_SAMPLE_MAX = 200;
const MAX_JUSTIFICATIONS_PER_TOOL = 2;
const MAX_BODY_LINES_PER_AGENT = 25;

// Tools whose presence we want to mention explicitly in the per-agent subject
// phrase. Anything else just rolls up into the action count.
const TOOL_VERB_ORDER = [
  "create_vault",
  "wire_asset",
  "set_vault_assets",
  "allocate_to_perp",
  "withdraw_from_perp",
  "open_position",
  "close_position",
];

function shortAddr(addr) {
  if (!addr || typeof addr !== "string" || !addr.startsWith("0x")) return addr ?? "(unknown)";
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-3)}`;
}

function truncate(text, max, suffix = "…") {
  if (!text) return "";
  const s = String(text).replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - suffix.length)) + suffix;
}

function truncateSubject(subject) {
  if (subject.length <= SUBJECT_MAX) return subject;
  return subject.slice(0, SUBJECT_MAX - 3) + "...";
}

// Parse `apps/web/public/agent-metadata/<vault>.json`.
// Returns `null` if the JSON is unusable.
function parseMetadata(text, path) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (!json || typeof json !== "object") return null;
  const vaultAddress = basename(path).replace(/\.json$/i, "");
  const runId = json.latestRun?.runId ?? null;
  const actions = Array.isArray(json.recentActions)
    ? json.recentActions.filter((a) => a && (!runId || a.runId === runId))
    : [];
  return {
    agentName: json.agentName || "(unknown-agent)",
    vaultAddress,
    summary: typeof json.latestRun?.summary === "string" ? json.latestRun.summary : "",
    finishedAt: json.latestRun?.finishedAt || json.lastRunAt || null,
    actions,
  };
}

// Extract a structured MCP error_code from an `errors[]` / `softFailures[]`
// entry. The agent-runner writes `entry.errorCode` directly (since
// 2026-05-23) but older run-log lines only have `entry.error` as a JSON
// string we have to parse out of. Returns null when no code is present
// (e.g. free-text MCP -32xxx errors).
function extractErrorCodeFromEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  if (typeof entry.errorCode === "string" && entry.errorCode) return entry.errorCode;
  const errText = typeof entry.error === "string" ? entry.error : "";
  if (!errText) return null;
  const jsonMatch = errText.match(/"error_code"\s*:\s*"([A-Z][A-Z0-9_]+)"/);
  if (jsonMatch) return jsonMatch[1];
  const looseMatch = errText.match(/\berror_code\s*[:=]\s*"?([A-Z][A-Z0-9_]+)"?/);
  if (looseMatch) return looseMatch[1];
  return null;
}

// Extract a short, human-friendly excerpt from a structured MCP error
// payload. Prefers `.message` so operators see "Vault: _size must be more
// than _collateral" rather than 30 chars of JSON wrapper before truncation
// hides the actual revert reason. Falls back to the raw string for
// non-JSON / free-text errors (e.g. "MCP error -32603: Internal error").
function summarizeErrorPayload(rawText) {
  if (typeof rawText !== "string" || !rawText) return "";
  const trimmed = rawText.trim();
  if (!trimmed.startsWith("{")) return trimmed;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && typeof parsed.message === "string") {
      return parsed.message;
    }
  } catch {
    // fall through
  }
  return trimmed;
}

// Group `errors[]` (or `softFailures[]`) entries by error_code. The first
// occurrence's elided error text is kept verbatim so operators can grep
// the commit body for the offending payload. Returns
//   [{ code, count, firstTool, firstError, firstMessage }]
// sorted by count desc then code asc for deterministic output.
function groupErrorsByCode(entries) {
  const byCode = new Map();
  for (const entry of entries) {
    const code = extractErrorCodeFromEntry(entry);
    const key = code || "(no error_code)";
    if (!byCode.has(key)) {
      const rawError = typeof entry?.error === "string" ? entry.error : "";
      byCode.set(key, {
        code,
        count: 0,
        firstTool: entry?.tool || null,
        firstError: rawError,
        firstMessage: summarizeErrorPayload(rawError),
      });
    }
    byCode.get(key).count += 1;
  }
  return Array.from(byCode.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return String(a.code || "").localeCompare(String(b.code || ""));
  });
}

// Parse the LAST JSON line of `agents/memory/<agent>/run-log.<network>.jsonl`.
// We only need the most recent run; older entries are persisted history.
function parseRunLogTail(text, path) {
  const lines = String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  let last = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      last = JSON.parse(lines[i]);
      break;
    } catch {
      // skip malformed tail line and try the previous one
    }
  }
  if (!last || typeof last !== "object") return null;
  // Path looks like agents/memory/<agent>/run-log.<network>.jsonl
  const parentDir = basename(dirname(path));
  const inferredAgent = parentDir || last.agent || "(unknown-agent)";
  const skippedWrites = Array.isArray(last.writeActions)
    ? last.writeActions.filter((w) => w && w.skipped).length
    : 0;
  const errors = Array.isArray(last.errors) ? last.errors : [];
  const softFailures = Array.isArray(last.softFailures) ? last.softFailures : [];
  return {
    agentName: last.agent || inferredAgent,
    network: last.network || null,
    turns: Number.isFinite(last.turns) ? last.turns : null,
    errorCount: errors.length,
    errors,
    softFailureCount: softFailures.length,
    softFailures,
    skippedWrites,
    finishedAt: last.timestamp || null,
    summary: typeof last.summary === "string" ? last.summary : "",
    vault: last.vault || null,
  };
}

function groupActionsByTool(actions) {
  const groups = new Map();
  for (const a of actions) {
    const tool = a.tool || "(unknown_tool)";
    if (!groups.has(tool)) {
      groups.set(tool, { tool, count: 0, withTx: 0, longs: 0, shorts: 0, justifications: [] });
    }
    const g = groups.get(tool);
    g.count += 1;
    if (a.txHash) g.withTx += 1;
    // open_position recentActions don't include args, but justifications often
    // mention "long" / "short" — best-effort breakdown for the subject only.
    if (tool === "open_position" && typeof a.justification === "string") {
      const j = a.justification.toLowerCase();
      if (/\bshort\b/.test(j)) g.shorts += 1;
      else if (/\blong\b/.test(j)) g.longs += 1;
    }
    if (a.justification && g.justifications.length < MAX_JUSTIFICATIONS_PER_TOOL) {
      g.justifications.push(a.justification);
    }
  }
  return groups;
}

// Per-agent subject phrase. `style` controls verbosity:
//   - "verbose": "mining-manager: wired 2 + set tracked + allocated + opened 1"
//   - "headline": only the most interesting verbs (writes/opens), e.g.
//     "mining-manager: wired 2 + opened 1"
//   - "compact": "mining-manager: 5 actions"
function buildAgentSubjectPhrase({ agentName, actions, runLog, style = "verbose" }) {
  const hasActions = actions.length > 0;
  const errorCount = runLog?.errorCount ?? 0;

  if (!hasActions && errorCount > 0) {
    return `${agentName} FAILED (${errorCount} error${errorCount === 1 ? "" : "s"})`;
  }
  if (!hasActions) {
    return `${agentName}: no on-chain actions`;
  }

  if (style === "ultra") {
    return `${agentName} (${actions.length})`;
  }
  if (style === "compact") {
    return `${agentName}: ${actions.length} action${actions.length === 1 ? "" : "s"}`;
  }

  const groups = groupActionsByTool(actions);
  const phrases = [];

  // In headline style we drop "auxiliary" verbs (set_vault_assets, allocate_*,
  // withdraw_*) so the subject focuses on capital-moving actions.
  const headlineTools = new Set([
    "create_vault",
    "wire_asset",
    "open_position",
    "close_position",
  ]);

  for (const tool of TOOL_VERB_ORDER) {
    const g = groups.get(tool);
    if (!g) continue;
    if (style === "headline" && !headlineTools.has(tool)) continue;
    switch (tool) {
      case "create_vault":
        phrases.push("created vault");
        break;
      case "wire_asset":
        phrases.push(`wired ${g.count}`);
        break;
      case "set_vault_assets":
        phrases.push("set tracked");
        break;
      case "allocate_to_perp":
        phrases.push("allocated");
        break;
      case "withdraw_from_perp":
        phrases.push("withdrew");
        break;
      case "open_position": {
        if (g.longs > 0 && g.shorts > 0) {
          phrases.push(`opened ${g.longs} long + ${g.shorts} short`);
        } else {
          phrases.push(`opened ${g.count}`);
        }
        break;
      }
      case "close_position":
        phrases.push(`closed ${g.count}`);
        break;
      default:
        break;
    }
  }

  if (style !== "headline") {
    const knownTools = new Set(TOOL_VERB_ORDER);
    let otherCount = 0;
    for (const [tool, g] of groups) {
      if (!knownTools.has(tool)) otherCount += g.count;
    }
    if (otherCount > 0) phrases.push(`${otherCount} other`);
  }

  if (phrases.length === 0) {
    // headline style filtered everything; fall back to total count.
    return `${agentName}: ${actions.length} action${actions.length === 1 ? "" : "s"}`;
  }

  return `${agentName}: ${phrases.join(" + ")}`;
}

function composeSubject(perAgentPhrases) {
  return `memory(agent): ${perAgentPhrases.join("; ")}`;
}

function renderAgentBody({ agentName, vaultAddress, actions, runLog, metadataSummary }) {
  const lines = [];
  const networkLabel = runLog?.network || "unknown-network";
  const turnsLabel = runLog?.turns != null ? `${runLog.turns} turns` : "? turns";
  const errorLabel = `${runLog?.errorCount ?? 0} errors`;
  const skippedLabel = runLog?.skippedWrites
    ? `, ${runLog.skippedWrites} skipped`
    : "";
  const headerVault = vaultAddress || runLog?.vault || null;

  lines.push(
    `${agentName} — vault ${shortAddr(headerVault)} (${networkLabel}, ${turnsLabel}, ${errorLabel}${skippedLabel})`,
  );

  if (actions.length === 0 && (runLog?.errorCount ?? 0) === 0) {
    lines.push("  (no on-chain actions this run)");
  }

  if (actions.length > 0) {
    lines.push("  Actions:");
    const groups = groupActionsByTool(actions);
    const orderedTools = [
      ...TOOL_VERB_ORDER.filter((t) => groups.has(t)),
      ...Array.from(groups.keys()).filter((t) => !TOOL_VERB_ORDER.includes(t)),
    ];
    for (const tool of orderedTools) {
      const g = groups.get(tool);
      const txSuffix =
        g.withTx === 0
          ? " (no tx)"
          : g.withTx < g.count
            ? ` (${g.withTx} on-chain)`
            : "";
      lines.push(`  - ${tool} × ${g.count}${txSuffix}`);
      for (const j of g.justifications) {
        lines.push(`      "${truncate(j, JUSTIFICATION_MAX)}"`);
      }
    }
  }

  const summarySource = metadataSummary || runLog?.summary || "";
  if (summarySource) {
    lines.push(`  Summary: ${truncate(summarySource, SUMMARY_MAX)}`);
  }

  if (runLog?.errorCount > 0) {
    lines.push(`  Errors: ${runLog.errorCount}`);
    const grouped = groupErrorsByCode(runLog.errors);
    for (const g of grouped) {
      const label = g.code || "(no error_code)";
      const toolPrefix = g.firstTool ? `${g.firstTool}: ` : "";
      const sampleSource = g.firstMessage || g.firstError;
      const sample = sampleSource ? truncate(sampleSource, ERROR_SAMPLE_MAX) : "(no detail)";
      lines.push(`    - ${label} × ${g.count} — ${toolPrefix}${sample}`);
    }
  }

  if ((runLog?.softFailureCount ?? 0) > 0) {
    const grouped = groupErrorsByCode(runLog.softFailures);
    const tally = grouped.map((g) => `${g.code || "uncoded"}:${g.count}`).join(", ");
    lines.push(`  Soft refusals: ${runLog.softFailureCount} (${tally})`);
  }

  if (lines.length > MAX_BODY_LINES_PER_AGENT) {
    const kept = lines.slice(0, MAX_BODY_LINES_PER_AGENT - 1);
    kept.push(`  … (${lines.length - kept.length} more lines truncated)`);
    return kept.join("\n");
  }
  return lines.join("\n");
}

// Pure builder. `readFile(path) -> string | null`. Returns `{ subject, body }`.
export function buildCommitMessage({
  stagedMetadataPaths = [],
  stagedRunLogPaths = [],
  stagedStatePaths = [],
  readFile,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof readFile !== "function") {
    throw new TypeError("buildCommitMessage requires a readFile(path) function");
  }

  const metadataByAgent = new Map();
  for (const path of stagedMetadataPaths) {
    const text = readFile(path);
    if (text == null) continue;
    const parsed = parseMetadata(text, path);
    if (!parsed) continue;
    metadataByAgent.set(parsed.agentName, parsed);
  }

  const runLogByAgent = new Map();
  for (const path of stagedRunLogPaths) {
    const text = readFile(path);
    if (text == null) continue;
    const parsed = parseRunLogTail(text, path);
    if (!parsed) continue;
    runLogByAgent.set(parsed.agentName, parsed);
  }

  // Union of agents seen across both sources, ordered alphabetically for
  // deterministic commit messages.
  const agentNames = Array.from(
    new Set([...metadataByAgent.keys(), ...runLogByAgent.keys()]),
  ).sort();

  if (agentNames.length === 0) {
    const stateRefreshOnly = stagedStatePaths.length > 0;
    const subject = stateRefreshOnly
      ? "memory(agent): refresh memory only"
      : "memory(agent): update agent memory and metadata";
    const body = stateRefreshOnly
      ? `Updated ${stagedStatePaths.length} state file(s) with no per-run metadata or run-log changes.\n\nRun finished: ${now()}`
      : `Run finished: ${now()}`;
    return { subject, body };
  }

  const perAgent = agentNames.map((agentName) => {
    const meta = metadataByAgent.get(agentName);
    const runLog = runLogByAgent.get(agentName);
    const actions = meta?.actions ?? [];
    const vaultAddress = meta?.vaultAddress || runLog?.vault || null;
    const bodyBlock = renderAgentBody({
      agentName,
      vaultAddress,
      actions,
      runLog,
      metadataSummary: meta?.summary || "",
    });
    return {
      agentName,
      actions,
      runLog,
      bodyBlock,
      finishedAt: meta?.finishedAt || runLog?.finishedAt || null,
    };
  });

  // Try increasingly compact subject styles until we fit under SUBJECT_MAX.
  // Falling back through "verbose" -> "headline" -> "compact" -> "ultra"
  // preserves every agent's name (the most important signal for at-a-glance
  // reading) before we resort to ellipsis truncation.
  let subject = null;
  for (const style of ["verbose", "headline", "compact", "ultra"]) {
    const phrases = perAgent.map((p) =>
      buildAgentSubjectPhrase({ agentName: p.agentName, actions: p.actions, runLog: p.runLog, style }),
    );
    const candidate = composeSubject(phrases);
    if (candidate.length <= SUBJECT_MAX) {
      subject = candidate;
      break;
    }
    subject = candidate; // remember the most-compact attempt for final truncation
  }
  subject = truncateSubject(subject);

  const finishedAt =
    perAgent.map((a) => a.finishedAt).filter(Boolean).sort().slice(-1)[0] || now();

  const body =
    perAgent.map((a) => a.bodyBlock).join("\n\n") +
    `\n\nRun finished: ${finishedAt}`;

  return { subject, body };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function listStagedFiles(cwd) {
  let out;
  try {
    out = execFileSync("git", ["diff", "--cached", "--name-only"], {
      cwd,
      encoding: "utf8",
    });
  } catch (err) {
    throw new Error(`git diff --cached --name-only failed: ${err.message}`);
  }
  return out.split("\n").map((l) => l.trim()).filter(Boolean);
}

function classifyStagedPaths(paths) {
  const metadata = [];
  const runLogs = [];
  const stateFiles = [];
  for (const p of paths) {
    if (/^apps\/web\/public\/agent-metadata\/0x[0-9a-fA-F]+\.json$/.test(p)) {
      metadata.push(p);
    } else if (/^agents\/memory\/[^/]+\/run-log\.[^/]+\.jsonl$/.test(p)) {
      runLogs.push(p);
    } else if (/^agents\/memory\/[^/]+\/state\.json$/.test(p)) {
      stateFiles.push(p);
    }
  }
  return { metadata, runLogs, stateFiles };
}

function readFileSafe(cwd) {
  return (path) => {
    const abs = resolve(cwd, path);
    if (!existsSync(abs)) return null;
    try {
      return readFileSync(abs, "utf8");
    } catch {
      return null;
    }
  };
}

function runCli() {
  const cwd = process.cwd();
  const staged = listStagedFiles(cwd);
  const { metadata, runLogs, stateFiles } = classifyStagedPaths(staged);
  const { subject, body } = buildCommitMessage({
    stagedMetadataPaths: metadata,
    stagedRunLogPaths: runLogs,
    stagedStatePaths: stateFiles,
    readFile: readFileSafe(cwd),
  });
  process.stdout.write(`${subject}\n\n${body}\n`);
}

const __filename = fileURLToPath(import.meta.url);
const isDirectCliEntry =
  process.argv[1] && resolve(process.argv[1]) === __filename;
if (isDirectCliEntry) {
  try {
    runCli();
  } catch (err) {
    process.stderr.write(`build-agent-commit-message: ${err.message}\n`);
    process.exit(1);
  }
}

export const __internals = {
  shortAddr,
  truncate,
  truncateSubject,
  parseMetadata,
  parseRunLogTail,
  classifyStagedPaths,
  buildAgentSubjectPhrase,
  renderAgentBody,
  groupActionsByTool,
  groupErrorsByCode,
  extractErrorCodeFromEntry,
  SUBJECT_MAX,
};
