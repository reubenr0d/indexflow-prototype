#!/usr/bin/env node

/**
 * Generic agent runner that loads agent definitions from markdown files.
 *
 * Each agent is an .md file under agents/ with YAML frontmatter (config) and
 * a markdown body (system prompt). A "## User Prompt" section separates the
 * system prompt from the initial user message.
 *
 * Features:
 *   - Multi-MCP-server support (tool collision detection)
 *   - Persistent memory per agent (state.json + run-log.<network>.jsonl)
 *   - Auto vault deployment on first run or agent file change
 *   - Vault address capture from create_vault result (with get_all_vaults fallback)
 *   - LLM retry with exponential backoff
 *   - Dry-run mode, token budget truncation, structured CI output
 *
 * Usage:
 *   node scripts/agent-runner.mjs <agent-name>
 *
 * Env vars (all agents):
 *   LLM_API_KEY              - API key for the LLM provider (required)
 *   LLM_BASE_URL             - Base URL (defaults to https://api.openai.com/v1)
 *   LLM_MODEL                - Model name (defaults to gpt-4o)
 *   AGENT_MAX_TURNS           - Override max turns from agent config
 *   AGENT_DRY_RUN             - Set to "1" to skip write tool calls
 *   AGENT_CONFIRM_WRITES      - Defaults to enabled; set to "0" to disable write confirmations
 *   AGENT_NON_INTERACTIVE_WRITE_EXECUTE - Set to "1" to auto-execute writes in non-interactive sessions
 *   AGENT_MAX_TOOL_RESPONSE   - Max chars from tool response sent to LLM (default 6000)
 *   AGENT_NETWORK             - Optional network key for run log files
 *   AGENT_VAULT_OVERRIDE      - Optional 0x address; when set, the agent targets
 *                                this vault for the run (skipping create_vault)
 *                                and no state/metadata/run-log writes are made
 *
 * Local env files: if present, `.env` and `.env.local` at the repo root are loaded
 * before reading configuration (existing shell env wins).
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createHash } from "node:crypto";
import { resolve, dirname, basename } from "node:path";
import { createInterface } from "node:readline/promises";
import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
  existsSync,
  renameSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import {
  classifyToolCalls,
  shouldBypassWriteConfirmation,
  shouldSkipWritesForNonInteractiveSession,
  isInteractiveTty,
  runRiskOfficerPass,
  DEFAULT_RISK_OFFICER_SYSTEM_PROMPT,
} from "./agent-runner-confirmation.mjs";
import { redactSecrets, redactSecretsDeep } from "./lib/redact-secrets.mjs";
import {
  recordRecentlyClosed,
  recordRecentlyOpened,
  getPositionOpenAgeMs,
  readNewsCacheUnion,
  CHURN_GUARD_WINDOW_MS,
} from "../apps/shared/agent-shared-memory.mjs";
import { pickQualifyingLongHeadline } from "../apps/shared/mining-news-sentiment.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

function loadRootEnv(root) {
  for (const name of [".env", ".env.local"]) {
    const envPath = resolve(root, name);
    if (!existsSync(envPath)) continue;
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed
        .slice(eqIdx + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

loadRootEnv(PROJECT_ROOT);

const MEMORY_DIR = resolve(PROJECT_ROOT, "agents", "memory");

// ---------------------------------------------------------------------------
// Markdown frontmatter parser (no external YAML dependency)
// ---------------------------------------------------------------------------

function parseAgentMarkdown(raw) {
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!fmMatch) {
    throw new Error(
      "Agent markdown must start with YAML frontmatter (--- ... ---)"
    );
  }

  const frontmatter = parseSimpleYaml(fmMatch[1]);
  const body = fmMatch[2].trim();

  const userPromptHeading = /^## User Prompt\s*$/m;
  const splitIdx = body.search(userPromptHeading);

  let systemPrompt, userPrompt;
  if (splitIdx === -1) {
    systemPrompt = body;
    userPrompt = "Execute your assigned task and provide a summary when done.";
  } else {
    systemPrompt = body.slice(0, splitIdx).trim();
    const afterHeading = body
      .slice(splitIdx)
      .replace(userPromptHeading, "")
      .trim();
    userPrompt = afterHeading;
  }

  return { frontmatter, systemPrompt, userPrompt };
}

function parseSimpleYaml(yamlStr) {
  const result = {};
  const lines = yamlStr.split(/\r?\n/);
  let currentKey = null;
  let currentList = null;

  for (const line of lines) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;

    const listItem = line.match(/^  - (.+)$/);
    if (listItem && currentKey) {
      if (!currentList) currentList = [];
      currentList.push(listItem[1].trim());
      continue;
    }

    if (currentKey && currentList) {
      result[currentKey] = currentList;
      currentList = null;
      currentKey = null;
    }

    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      const val = kvMatch[2].trim();
      if (val === "") {
        currentKey = key;
        currentList = null;
      } else {
        result[key] = parseYamlValue(val);
        currentKey = null;
      }
    }
  }

  if (currentKey && currentList) {
    result[currentKey] = currentList;
  }

  return result;
}

function parseYamlValue(val) {
  if (val === "true") return true;
  if (val === "false") return false;
  if (/^-?\d+$/.test(val)) return parseInt(val, 10);
  if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val);
  return val.replace(/^["']|["']$/g, "");
}

function parseBigIntish(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s*\[[^\]]+\]\s*$/, "").trim();
  if (!cleaned) return null;
  if (/^-?\d+$/.test(cleaned)) return BigInt(cleaned);
  if (/^-?0x[0-9a-fA-F]+$/.test(cleaned)) return BigInt(cleaned);
  return null;
}

function parseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseAgentPolicy(frontmatter) {
  const hasPolicyFields =
    frontmatter.autoAllocateTargetBps !== undefined ||
    frontmatter.entryMode !== undefined ||
    frontmatter.entryMomentumPctMin !== undefined ||
    frontmatter.entryVolumeMin !== undefined ||
    frontmatter.entryMlScoreMin !== undefined ||
    frontmatter.entryQualityScoreMin !== undefined ||
    frontmatter.entryDirection !== undefined ||
    frontmatter.maxNewPositionsPerRun !== undefined ||
    frontmatter.maxNewShortsPerRun !== undefined ||
    frontmatter.maxTrackedAssets !== undefined ||
    frontmatter.positionSizingMode !== undefined ||
    frontmatter.rebalanceMode !== undefined ||
    frontmatter.autoExitMode !== undefined ||
    frontmatter.entryMaxSignalAgeDays !== undefined ||
    frontmatter.entryRecencyHalfLifeDays !== undefined ||
    frontmatter.minHoldingHours !== undefined ||
    frontmatter.takeProfitPct !== undefined ||
    frontmatter.stopLossPct !== undefined;

  if (!hasPolicyFields) {
    return {
      enabled: false,
      autoAllocateTargetBps: 0,
      entryMode: "none",
      entryMomentumPctMin: 0,
      entryVolumeMin: 0,
      entryMlScoreMin: 0,
      entryQualityScoreMin: 0,
      entryDirection: "long_only",
      maxNewPositionsPerRun: 0,
      maxNewShortsPerRun: 0,
      maxTrackedAssets: 0,
      positionSizingMode: "model_decides",
      rebalanceMode: "none",
      autoExitMode: "none",
      entryMaxSignalAgeDays: 180,
      entryMaxRecent5dReturnPct: 20,
      entryMaxRecent20dReturnPct: 50,
      entryRecencyHalfLifeDays: 90,
      entryRequireLongNews: false,
      entryLongNewsMaxAgeDays: 90,
      minHoldingHours: 0,
      takeProfitPct: null,
      stopLossPct: null,
    };
  }

  const autoAllocateTargetBps = Number(frontmatter.autoAllocateTargetBps ?? 0);
  const entryMode = String(frontmatter.entryMode ?? "none");
  const entryMomentumPctMin = Number(frontmatter.entryMomentumPctMin ?? 0);
  const entryVolumeMin = Number(frontmatter.entryVolumeMin ?? 0);
  const entryMlScoreMin = Number(frontmatter.entryMlScoreMin ?? 0);
  const entryQualityScoreMin = Number(frontmatter.entryQualityScoreMin ?? 0);
  const entryDirection = String(frontmatter.entryDirection ?? "long_only");
  const maxNewPositionsPerRun = Number(frontmatter.maxNewPositionsPerRun ?? 0);
  const maxNewShortsPerRun = Number(frontmatter.maxNewShortsPerRun ?? 0);
  const maxTrackedAssets = Number(frontmatter.maxTrackedAssets ?? 0);
  const positionSizingMode = String(frontmatter.positionSizingMode ?? "model_decides");
  const rebalanceMode = String(frontmatter.rebalanceMode ?? "none");
  const autoExitMode = String(frontmatter.autoExitMode ?? "none");
  const entryMaxSignalAgeDays = Number(frontmatter.entryMaxSignalAgeDays ?? 180);
  const entryMaxRecent5dReturnPct = Number(frontmatter.entryMaxRecent5dReturnPct ?? 20);
  const entryMaxRecent20dReturnPct = Number(frontmatter.entryMaxRecent20dReturnPct ?? 50);
  const entryRecencyHalfLifeDays = Number(frontmatter.entryRecencyHalfLifeDays ?? 90);
  const entryRequireLongNews = Boolean(frontmatter.entryRequireLongNews);
  const entryLongNewsMaxAgeDays = Number(frontmatter.entryLongNewsMaxAgeDays ?? 90);
  const minHoldingHours = Number(frontmatter.minHoldingHours ?? 0);
  const takeProfitPctRaw = frontmatter.takeProfitPct;
  const stopLossPctRaw = frontmatter.stopLossPct;
  const takeProfitPct =
    takeProfitPctRaw === undefined || takeProfitPctRaw === null
      ? null
      : Number(takeProfitPctRaw);
  const stopLossPct =
    stopLossPctRaw === undefined || stopLossPctRaw === null
      ? null
      : Number(stopLossPctRaw);

  if (!Number.isFinite(autoAllocateTargetBps) || autoAllocateTargetBps < 0 || autoAllocateTargetBps > 10_000) {
    throw new Error("Invalid autoAllocateTargetBps; expected 0..10000");
  }
  if (!["none", "momentum_volume", "ml_score", "quality_score"].includes(entryMode)) {
    throw new Error("Invalid entryMode; expected 'none', 'momentum_volume', 'ml_score', or 'quality_score'");
  }
  if (!Number.isFinite(entryMomentumPctMin) || entryMomentumPctMin < 0) {
    throw new Error("Invalid entryMomentumPctMin; expected >= 0");
  }
  if (!Number.isFinite(entryVolumeMin) || entryVolumeMin < 0) {
    throw new Error("Invalid entryVolumeMin; expected >= 0");
  }
  if (!Number.isFinite(entryMlScoreMin) || entryMlScoreMin < 0 || entryMlScoreMin > 100) {
    throw new Error("Invalid entryMlScoreMin; expected 0..100");
  }
  if (!Number.isFinite(entryQualityScoreMin) || entryQualityScoreMin < 0 || entryQualityScoreMin > 100) {
    throw new Error("Invalid entryQualityScoreMin; expected 0..100");
  }
  if (!["long_only", "short_only", "long_short"].includes(entryDirection)) {
    throw new Error(
      "Invalid entryDirection; expected 'long_only', 'short_only', or 'long_short'",
    );
  }
  if (!Number.isFinite(maxNewPositionsPerRun) || maxNewPositionsPerRun < 0) {
    throw new Error("Invalid maxNewPositionsPerRun; expected >= 0");
  }
  if (!Number.isFinite(maxNewShortsPerRun) || maxNewShortsPerRun < 0) {
    throw new Error("Invalid maxNewShortsPerRun; expected >= 0");
  }
  if (maxNewShortsPerRun > maxNewPositionsPerRun) {
    throw new Error(
      "Invalid maxNewShortsPerRun; must be <= maxNewPositionsPerRun (the combined cap)",
    );
  }
  if (entryDirection === "long_only" && maxNewShortsPerRun > 0) {
    throw new Error(
      "Invalid maxNewShortsPerRun; must be 0 when entryDirection is 'long_only'",
    );
  }
  if (!Number.isFinite(maxTrackedAssets) || maxTrackedAssets < 0) {
    throw new Error("Invalid maxTrackedAssets; expected >= 0");
  }
  if (!["none", "track_top_n"].includes(rebalanceMode)) {
    throw new Error("Invalid rebalanceMode; expected 'none' or 'track_top_n'");
  }
  // autoExitMode is an additive flag set: comma- or plus-separated tokens
  // out of {rank_swap, pnl_band}. `none` (or unset) disables both. The
  // runner enforces the corresponding closures deterministically in the
  // pre-LLM auto-rebalance pass before the LLM gets the turn, so agents
  // that opt in don't have to re-litigate close-vs-keep on every run.
  const VALID_AUTO_EXIT_TOKENS = new Set(["none", "rank_swap", "pnl_band"]);
  const autoExitTokens = autoExitMode
    .split(/[+,]/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (autoExitTokens.length === 0) {
    throw new Error("Invalid autoExitMode; expected 'none', 'rank_swap', 'pnl_band', or a '+'-joined combination");
  }
  for (const token of autoExitTokens) {
    if (!VALID_AUTO_EXIT_TOKENS.has(token)) {
      throw new Error(`Invalid autoExitMode token "${token}"; expected one of 'none', 'rank_swap', 'pnl_band'`);
    }
  }
  if (autoExitTokens.includes("none") && autoExitTokens.length > 1) {
    throw new Error("Invalid autoExitMode; 'none' cannot be combined with other tokens");
  }
  if (autoExitTokens.includes("rank_swap") && rebalanceMode !== "track_top_n") {
    throw new Error(
      "Invalid autoExitMode; 'rank_swap' requires rebalanceMode='track_top_n' (it rotates by top-N rank)",
    );
  }
  if (!Number.isFinite(entryMaxSignalAgeDays) || entryMaxSignalAgeDays < 1) {
    throw new Error("Invalid entryMaxSignalAgeDays; expected >= 1");
  }
  if (!Number.isFinite(entryRecencyHalfLifeDays) || entryRecencyHalfLifeDays < 1) {
    throw new Error("Invalid entryRecencyHalfLifeDays; expected >= 1");
  }
  if (!Number.isFinite(minHoldingHours) || minHoldingHours < 0) {
    throw new Error("Invalid minHoldingHours; expected >= 0");
  }
  if (takeProfitPct !== null && (!Number.isFinite(takeProfitPct) || takeProfitPct <= 0 || takeProfitPct > 1)) {
    throw new Error("Invalid takeProfitPct; expected (0, 1] or omit");
  }
  if (stopLossPct !== null && (!Number.isFinite(stopLossPct) || stopLossPct <= 0 || stopLossPct > 1)) {
    throw new Error("Invalid stopLossPct; expected (0, 1] or omit");
  }

  // Normalise to the canonical token form so downstream code can use
  // `policy.autoExitMode.includes("rank_swap")` without re-parsing.
  const normalisedAutoExit = autoExitTokens.includes("none")
    ? "none"
    : Array.from(new Set(autoExitTokens)).sort().join("+");

  return {
    enabled: true,
    autoAllocateTargetBps,
    entryMode,
    entryMomentumPctMin,
    entryVolumeMin,
    entryMlScoreMin,
    entryQualityScoreMin,
    entryDirection,
    maxNewPositionsPerRun,
    maxNewShortsPerRun,
    maxTrackedAssets,
    positionSizingMode,
    rebalanceMode,
    autoExitMode: normalisedAutoExit,
    entryMaxSignalAgeDays,
    entryMaxRecent5dReturnPct,
    entryMaxRecent20dReturnPct,
    entryRecencyHalfLifeDays,
    entryRequireLongNews,
    entryLongNewsMaxAgeDays,
    minHoldingHours,
    takeProfitPct,
    stopLossPct,
  };
}

function pickQualityEntryScore(pick) {
  if (!pick) return 0;
  const readiness = Number(pick.tradeReadinessScore);
  if (Number.isFinite(readiness)) return readiness;
  return Number(pick.compositeScore ?? pick.composite ?? 0);
}

// ---------------------------------------------------------------------------
// Vault-arg pinning (write tools)
// ---------------------------------------------------------------------------

// Tools that accept a `vault` arg and operate against a single bound vault.
// For write tools we override hallucinated values with the agent's canonical
// vault (state.vaultAddress / capturedVaultAddress) so the LLM cannot
// accidentally target a sibling vault or burn gas on a malformed address.
//
// This is the belt-and-suspenders pair to the MCP-side INVALID_ADDRESS
// validator added in `apps/mcps/vault-manager/address-validation.mjs`: by
// pinning here the call never reaches the MCP with a bad shape, but if it
// somehow does the MCP still rejects it cleanly. See the 2026-05-22
// quality-matrix-manager incident (run-log entry `2026-05-22T...:open_position`)
// where the LLM emitted `vault = 0xbd7ea7e23ae07f0dd65b2bf6ecc95018c610da029ccb697f17b69b2`
// — the prefix of the real vault concatenated with the suffix of the GRSL.V
// assetId — and burnt three turns retrying the same broken arg.
const VAULT_ARG_WRITE_TOOLS = new Set([
  "set_vault_assets",
  "allocate_to_perp",
  "withdraw_from_perp",
  "open_position",
  "close_position",
]);

// Pure helper. Mutates `args` in-place when an override is applied so the
// downstream MCP call sees the canonical vault. Returns a structured
// description of what (if anything) was overridden so the caller can log /
// record diagnostics. Safe to call with non-write tool names; will no-op.
function applyVaultArgPin({ toolName, args, canonicalVault }) {
  if (!VAULT_ARG_WRITE_TOOLS.has(toolName)) {
    return { overridden: false, reason: "TOOL_NOT_VAULT_WRITE" };
  }
  if (!canonicalVault || typeof canonicalVault !== "string") {
    return { overridden: false, reason: "NO_CANONICAL_VAULT" };
  }
  if (typeof args !== "object" || args === null) {
    return { overridden: false, reason: "ARGS_NOT_OBJECT" };
  }
  const supplied = typeof args.vault === "string" ? args.vault : "";
  if (supplied && supplied.toLowerCase() === canonicalVault.toLowerCase()) {
    return { overridden: false, reason: "ALREADY_CANONICAL" };
  }
  const note = `Runner pinned vault to canonical ${canonicalVault} (LLM supplied ${supplied || "(missing)"}).`;
  args.vault = canonicalVault;
  if (typeof args.justification === "string" && args.justification.length > 0) {
    args.justification = `${args.justification} [runner: ${note}]`;
  } else {
    args.justification = note;
  }
  return {
    overridden: true,
    suppliedVault: supplied || null,
    canonicalVault,
  };
}

// ---------------------------------------------------------------------------
// Memory helpers
// ---------------------------------------------------------------------------

function agentMemoryDir(agentName) {
  return resolve(MEMORY_DIR, agentName);
}

function sanitizeNetworkKey(value) {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "default";
}

function inferNetworkKeyFromDeploymentConfig() {
  const deploymentConfig = process.env.DEPLOYMENT_CONFIG;
  if (!deploymentConfig) return null;
  const file = basename(deploymentConfig);
  return sanitizeNetworkKey(
    file
      .replace(/-deployment\.json$/i, "")
      .replace(/\.deployment\.json$/i, "")
      .replace(/\.json$/i, "")
  );
}

function resolveRunNetworkKey() {
  if (process.env.AGENT_NETWORK) {
    return sanitizeNetworkKey(process.env.AGENT_NETWORK);
  }
  return inferNetworkKeyFromDeploymentConfig() || "default";
}

function runLogPath(agentName, networkKey) {
  return resolve(agentMemoryDir(agentName), `run-log.${networkKey}.jsonl`);
}

function resolveDeploymentConfigPath() {
  if (!process.env.DEPLOYMENT_CONFIG) return null;
  return resolve(PROJECT_ROOT, process.env.DEPLOYMENT_CONFIG);
}

function buildDeploymentFingerprint(runNetwork) {
  const deploymentConfigPath = resolveDeploymentConfigPath();
  const deploymentConfigExists = Boolean(
    deploymentConfigPath && existsSync(deploymentConfigPath)
  );
  const deploymentConfigContent = deploymentConfigExists
    ? readFileSync(deploymentConfigPath, "utf8")
    : "";
  const payload = JSON.stringify({
    runNetwork,
    rpcUrl: process.env.RPC_URL || "",
    deploymentConfigPath: deploymentConfigPath || "",
    deploymentConfigExists,
    deploymentConfigContent,
  });
  return {
    fingerprint: hashContent(payload),
    deploymentConfigPath,
  };
}

function shortHash(hash) {
  if (!hash) return "none";
  const normalized = String(hash);
  const hex = normalized.startsWith("sha256:")
    ? normalized.slice("sha256:".length)
    : normalized;
  return hex.slice(0, 10);
}

function shouldInvalidateDeploymentMemory(state, nextDeploymentFingerprint) {
  if (!state) return false;
  if (!state.deploymentFingerprint) return true;
  return state.deploymentFingerprint !== nextDeploymentFingerprint;
}

function resolveVaultLifecycle(state, currentAgentFileHash) {
  const needsNewVault = !state || !state.vaultAddress;
  const agentFileChanged = Boolean(
    state?.agentFileHash && state.agentFileHash !== currentAgentFileHash
  );
  return {
    needsNewVault,
    agentFileChanged,
  };
}

function rotateFileToArchive(filePath, reasonTag) {
  if (!existsSync(filePath)) return null;
  const archiveDir = resolve(dirname(filePath), "archive");
  mkdirSync(archiveDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const archivedPath = resolve(
    archiveDir,
    `${basename(filePath)}.${stamp}.${reasonTag}`
  );
  renameSync(filePath, archivedPath);
  return archivedPath;
}

function rotateAgentMemoryForDeploymentChange(
  agentName,
  networkKey,
  previousFingerprint,
  nextFingerprint
) {
  const reasonTag = `deployment-${shortHash(previousFingerprint)}-to-${shortHash(nextFingerprint)}`;
  const stateFilePath = resolve(agentMemoryDir(agentName), "state.json");
  const networkRunLogPath = runLogPath(agentName, networkKey);
  return {
    stateArchivePath: rotateFileToArchive(stateFilePath, reasonTag),
    runLogArchivePath: rotateFileToArchive(networkRunLogPath, reasonTag),
  };
}

function readState(agentName) {
  const p = resolve(agentMemoryDir(agentName), "state.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function writeState(agentName, state) {
  const dir = agentMemoryDir(agentName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "state.json"), JSON.stringify(state, null, 2) + "\n");
}

function readRecentRunLog(agentName, networkKey, count = 5) {
  const p = runLogPath(agentName, networkKey);
  if (!existsSync(p)) return [];
  try {
    const lines = readFileSync(p, "utf8")
      .split("\n")
      .filter((l) => l.trim());
    return lines
      .slice(-count)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function appendRunLog(agentName, networkKey, entry) {
  const dir = agentMemoryDir(agentName);
  mkdirSync(dir, { recursive: true });
  appendFileSync(runLogPath(agentName, networkKey), JSON.stringify(entry) + "\n");
}

// ---------------------------------------------------------------------------
// Closed-position post-mortems + "## Lessons" prompt block
// ---------------------------------------------------------------------------
//
// On every successful close we look up the matching open in (a) the current
// run's writeActions and (b) `recentRuns` (the tail of run-log.<network>.jsonl
// that was read at startup) and emit a `closedPositions[]` entry with both
// justifications, hold time, and realised PnL when known. The next run picks
// these up via `buildLessonsBlock` and surfaces the top-3 winners / losers
// in the "## Lessons" section of the system prompt — the agent literally
// reads what worked and what didn't before its next round of decisions.

function _normalizeAssetId(value) {
  return String(value || "").toLowerCase();
}

// Walk current-run writeActions first (newest first), then recentRuns
// (newest first), and return the most recent matching open_position entry
// or null. Match key is `(vault, assetId, isLong)`.
export function findMatchingOpen({
  vault,
  assetId,
  isLong,
  currentRunActions = [],
  recentRuns = [],
} = {}) {
  if (!vault || !assetId || typeof isLong !== "boolean") return null;
  const wantVault = String(vault).toLowerCase();
  const wantAssetId = _normalizeAssetId(assetId);

  const matches = (action, fallbackTimestamp) => {
    if (!action || action.tool !== "open_position") return null;
    if (action.skipped) return null;
    const args = action.args || {};
    if (String(args.vault || "").toLowerCase() !== wantVault) return null;
    if (_normalizeAssetId(args.assetId) !== wantAssetId) return null;
    if (typeof args.isLong !== "boolean" || args.isLong !== isLong) return null;
    return {
      timestamp: action.timestamp || fallbackTimestamp || null,
      justification: action.justification || args.justification || null,
      runId: action.runId || null,
      txHash: action.txHash || null,
      size: args.size || null,
      collateral: args.collateral || null,
    };
  };

  // 1) Current run, newest last in the array.
  for (let i = currentRunActions.length - 1; i >= 0; i--) {
    const hit = matches(currentRunActions[i]);
    if (hit) return hit;
  }

  // 2) Recent runs from disk, newest last in the array.
  for (let i = recentRuns.length - 1; i >= 0; i--) {
    const run = recentRuns[i];
    const ts = run?.timestamp || null;
    const actions = Array.isArray(run?.writeActions) ? run.writeActions : [];
    for (let j = actions.length - 1; j >= 0; j--) {
      const hit = matches(actions[j], ts);
      if (hit) {
        if (!hit.runId) hit.runId = ts;
        return hit;
      }
    }
  }
  return null;
}

// Build a single post-mortem entry for the close-side of a position.
// `realizedPnlUsdc` and `realizedPnlPctOfCollateral` may be null when the
// close path could not opportunistically capture them (e.g. an LLM-driven
// close without a pre-close roster snapshot); the entry is still useful
// for chronological "I just closed X" context even without numbers.
export function buildClosedPositionEntry({
  vault,
  assetId,
  isLong,
  ticker,
  closedAt,
  closedReason,
  closeJustification,
  realizedPnlUsdc = null,
  realizedPnlPctOfCollateral = null,
  matchingOpen = null,
} = {}) {
  const closedAtMs = closedAt ? Date.parse(closedAt) : Date.now();
  let holdHours = null;
  if (matchingOpen?.timestamp) {
    const openedAtMs = Date.parse(matchingOpen.timestamp);
    if (Number.isFinite(openedAtMs) && Number.isFinite(closedAtMs)) {
      holdHours = Math.max(0, (closedAtMs - openedAtMs) / (1000 * 60 * 60));
    }
  }
  return {
    vault: vault ? String(vault).toLowerCase() : null,
    assetId: _normalizeAssetId(assetId),
    ticker: ticker || null,
    side: isLong ? "long" : "short",
    closedAt: closedAt || new Date(closedAtMs).toISOString(),
    closedReason: closedReason || null,
    closeJustification: closeJustification || null,
    realizedPnlUsdc: realizedPnlUsdc != null ? String(realizedPnlUsdc) : null,
    realizedPnlPctOfCollateral:
      Number.isFinite(realizedPnlPctOfCollateral) ? realizedPnlPctOfCollateral : null,
    holdHours: Number.isFinite(holdHours) ? Number(holdHours.toFixed(2)) : null,
    entryRunId: matchingOpen?.runId || null,
    entryTimestamp: matchingOpen?.timestamp || null,
    entryJustification: matchingOpen?.justification || null,
    entryTxHash: matchingOpen?.txHash || null,
  };
}

const LESSONS_DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const LESSONS_DEFAULT_TOP_N = 3;

// Format a single closed-position entry into a one-line bullet for the
// "## Lessons" block. Quoting the entry justification verbatim is the whole
// point — the agent reads back what reasoning it used previously and reuses
// or discards it based on the realised outcome.
function _formatLessonRow(entry) {
  const ticker = entry.ticker || entry.assetId.slice(0, 10) + "…";
  const side = entry.side || "long";
  const pctPart =
    Number.isFinite(entry.realizedPnlPctOfCollateral)
      ? `${(entry.realizedPnlPctOfCollateral * 100).toFixed(1)}%`
      : "n/a";
  const sign = Number.isFinite(entry.realizedPnlPctOfCollateral)
    ? entry.realizedPnlPctOfCollateral >= 0
      ? "+"
      : ""
    : "";
  const holdPart =
    Number.isFinite(entry.holdHours)
      ? `${entry.holdHours.toFixed(1)}h`
      : "?h";
  const just = entry.entryJustification
    ? `"${entry.entryJustification.replace(/\s+/g, " ").slice(0, 140).trim()}"`
    : "(no entry justification on file)";
  const exitReason = entry.closedReason
    ? ` — exit: ${entry.closedReason.replace(/\s+/g, " ").slice(0, 80).trim()}`
    : "";
  return `${ticker} ${side} ${sign}${pctPart} (${holdPart}) ${just}${exitReason}`;
}

// Scan the runlog tail for `closedPositions[]` entries within `windowMs`,
// rank by realised PnL, and emit a markdown "## Lessons" block with the
// top winners + losers. Returns an empty string when no usable data is
// available (e.g. a fresh agent with no prior closes), so the caller can
// inject it unconditionally without producing an empty heading.
export function buildLessonsBlock({
  runs = [],
  now = Date.now(),
  windowMs = LESSONS_DEFAULT_WINDOW_MS,
  topN = LESSONS_DEFAULT_TOP_N,
} = {}) {
  if (!Array.isArray(runs) || runs.length === 0) return "";
  const cutoff = now - windowMs;
  const closures = [];
  for (const run of runs) {
    const list = Array.isArray(run?.closedPositions) ? run.closedPositions : [];
    for (const closure of list) {
      if (!closure) continue;
      const closedAtMs = Date.parse(closure.closedAt || "");
      if (!Number.isFinite(closedAtMs) || closedAtMs < cutoff) continue;
      closures.push(closure);
    }
  }
  if (closures.length === 0) return "";

  const ranked = closures.filter((c) => Number.isFinite(c.realizedPnlPctOfCollateral));
  const winners = ranked
    .filter((c) => c.realizedPnlPctOfCollateral > 0)
    .sort((a, b) => b.realizedPnlPctOfCollateral - a.realizedPnlPctOfCollateral)
    .slice(0, topN);
  const losers = ranked
    .filter((c) => c.realizedPnlPctOfCollateral < 0)
    .sort((a, b) => a.realizedPnlPctOfCollateral - b.realizedPnlPctOfCollateral)
    .slice(0, topN);

  const flat = ranked.length === 0 ? closures.slice(0, topN) : null;

  const lines = ["", "## Lessons (last 30 days, closed positions)"];
  if (winners.length > 0) {
    lines.push("");
    lines.push("**Wins** (highest realised PnL on collateral; lean into similar setups):");
    for (const w of winners) lines.push(`- ${_formatLessonRow(w)}`);
  }
  if (losers.length > 0) {
    lines.push("");
    lines.push("**Losses** (worst realised PnL on collateral; do not re-enter these theses without a fresh signal):");
    for (const l of losers) lines.push(`- ${_formatLessonRow(l)}`);
  }
  if (winners.length === 0 && losers.length === 0 && flat) {
    lines.push("");
    lines.push("Recent closes (no realised PnL captured — chronological only):");
    for (const c of flat) lines.push(`- ${_formatLessonRow(c)}`);
  }
  lines.push("");
  lines.push(
    "Use these post-mortems as PRIORS only — current Atlas/Quality picks + live news still drive every decision. If you re-cite a winning entry justification verbatim, it should be because the same setup recurs, not because it worked once.",
  );
  return lines.join("\n");
}

// File-based memory adapter. Writes everything under agents/memory/<agent>/,
// which is tracked in git so CI runs can commit state + run-log back after
// each scheduled execution (see .github/workflows/vault-agent.yml).
function createFileMemoryAdapter({ agentName, networkKey }) {
  return {
    mode: "file",
    async readState() {
      return { state: readState(agentName), source: "file" };
    },
    async readRecentRunLog(limit = 5) {
      return readRecentRunLog(agentName, networkKey, limit);
    },
    async writeState(newState) {
      writeState(agentName, newState);
    },
    async appendRunLog(entry) {
      appendRunLog(agentName, networkKey, entry);
    },
    async publishAgentMetadata({ config, state, runSummary }) {
      publishAgentMetadata(config, state, runSummary);
    },
    async publishPaperclipHeartbeat({ config, state, runSummary, network, status }) {
      publishPaperclipHeartbeat({ config, state, runSummary, network, status });
    },
  };
}

function hashContent(content) {
  return "sha256:" + createHash("sha256").update(content, "utf8").digest("hex");
}

// AGENT_VAULT_OVERRIDE lets a single CI/manual run target an arbitrary vault
// address instead of the agent's canonical stored vault. Returns the normalized
// 0x address or null if the env var is unset / invalid.
function parseVaultOverride(rawValue) {
  if (rawValue === undefined || rawValue === null) return null;
  const trimmed = String(rawValue).trim();
  if (!trimmed) return null;
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    console.warn(
      `Memory: AGENT_VAULT_OVERRIDE="${trimmed}" is not a valid 0x address; ignoring override.`
    );
    return null;
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Load agent config
// ---------------------------------------------------------------------------

function loadAgentConfig(agentName) {
  const agentPath = resolve(PROJECT_ROOT, "agents", `${agentName}.md`);
  let raw;
  try {
    raw = readFileSync(agentPath, "utf8");
  } catch {
    throw new Error(`Agent file not found: agents/${agentName}.md`);
  }

  const fileHash = hashContent(raw);
  const { frontmatter, systemPrompt, userPrompt } = parseAgentMarkdown(raw);

  const registryPath = resolve(PROJECT_ROOT, "agents", "mcp-servers.json");
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));

  const serverNames = frontmatter.mcpServers || [];
  const mcpServers = serverNames.map((name) => {
    const entry = registry[name];
    if (!entry)
      throw new Error(
        `MCP server "${name}" not found in agents/mcp-servers.json`
      );
    return { name, ...entry };
  });

  const writeTools = new Set(frontmatter.writeTools || []);

  const skillNames = frontmatter.skills || [];
  const skills = skillNames.map((name) => {
    const skillPath = resolve(PROJECT_ROOT, "agents", "skills", `${name}.md`);
    try {
      return readFileSync(skillPath, "utf8").trim();
    } catch {
      throw new Error(`Skill file not found: agents/skills/${name}.md`);
    }
  });

  return {
    name: frontmatter.name || agentName,
    description: frontmatter.description || "",
    mcpServers,
    writeTools,
    policy: parseAgentPolicy(frontmatter),
    skills,
    systemPrompt,
    userPrompt,
    maxTurns: frontmatter.maxTurns || 20,
    temperature: frontmatter.temperature ?? 0.2,
    vaultName: frontmatter.vaultName || null,
    depositFeeBps: frontmatter.depositFeeBps ?? 50,
    redeemFeeBps: frontmatter.redeemFeeBps ?? 50,
    // Optional per-agent model pin. Preferred way to give a single
    // agent (typically a meta-agent like `self-improver`) a stronger
    // code-tuned model without changing the global `LLM_MODEL` for
    // trading agents. Resolved via `resolveAgentModel` in runAgent.
    model: typeof frontmatter.model === "string" && frontmatter.model.trim()
      ? frontmatter.model.trim()
      : null,
    fileHash,
  };
}

// ---------------------------------------------------------------------------
// Global env config
// ---------------------------------------------------------------------------

const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_BASE_URL = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
const LLM_MODEL = process.env.LLM_MODEL || "gpt-4o";

// Mutable active-model slot used by `chatCompletion`. Defaults to the
// global `LLM_MODEL` for back-compat (callers that never invoke
// `setActiveModel` get the env-derived value, unchanged). The runner
// sets this once per `runAgent` invocation via `resolveAgentModel` so
// the same Node process can host different model choices for different
// agents on subsequent invocations (e.g. tests). See `resolveAgentModel`
// below for precedence rules.
let activeModel = LLM_MODEL;
let activeModelSource = "env-global";

// Pure helper exposed for unit tests. Returns `{ model, source }`
// where `source` is one of:
//   "frontmatter"   — `frontmatter.model` (per-agent, version-controlled)
//   "env-per-agent" — `LLM_MODEL_<UPPER_SNAKE_AGENT>` (CI-side override)
//   "env-global"    — `LLM_MODEL` (legacy default; trading agents)
//   "default"       — hard-coded `gpt-4o` fallback
//
// Precedence is intentional: meta-agents like `self-improver` whose
// entire job is exact-substring code edits ship `model: gpt-5-codex`
// in their frontmatter, so a vanilla repo checkout uses the code-tuned
// model for them without any operator action. Trading agents leave the
// field unset and continue to follow `LLM_MODEL`.
export function resolveAgentModel({ agentName, frontmatter, env = process.env } = {}) {
  if (frontmatter && typeof frontmatter.model === "string" && frontmatter.model.trim()) {
    return { model: frontmatter.model.trim(), source: "frontmatter" };
  }
  if (typeof agentName === "string" && agentName.trim()) {
    const envKey = `LLM_MODEL_${agentName.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
    const perAgent = env[envKey];
    if (typeof perAgent === "string" && perAgent.trim()) {
      return { model: perAgent.trim(), source: "env-per-agent", envKey };
    }
  }
  const global = env.LLM_MODEL;
  if (typeof global === "string" && global.trim()) {
    return { model: global.trim(), source: "env-global" };
  }
  return { model: "gpt-4o", source: "default" };
}

// Module-private setter. Splitting set + resolve keeps the resolver
// pure (and unit-testable without mutating module state).
function setActiveModel({ model, source }) {
  activeModel = model;
  activeModelSource = source;
}

// Predicate: does `model` need to be called via /v1/responses instead of
// /v1/chat/completions? Currently only the `gpt-5-codex` family
// (including future dated snapshots like `gpt-5-codex-2025-09-15`) and
// `gpt-5.1-codex` family are responses-API-only. Trading models
// (`gpt-4o`, `gpt-5`, `gpt-5-mini`, etc.) continue on chat-completions.
//
// Exported for unit tests; also drives the dispatch branch in
// `chatCompletion`. Operators can force the responses path independently
// of the model name via `LLM_USE_RESPONSES_API=1` (handled at the call
// site, not here, so this helper stays pure).
export function modelRequiresResponsesApi(model) {
  if (typeof model !== "string") return false;
  const m = model.trim().toLowerCase();
  if (!m) return false;
  if (m === "gpt-5-codex" || m === "gpt-5.1-codex") return true;
  if (m.startsWith("gpt-5-codex-")) return true;
  if (m.startsWith("gpt-5.1-codex-")) return true;
  return false;
}

// Pure helper: translate the chat-completions-shape request the runner
// builds internally into the /v1/responses request body. Kept pure (no
// fetch, no module-state reads) so tests can pin the schema without
// hitting the network.
//
// Inputs:
//   messages    — chat-completions messages array. The runner only ever
//                 seeds ONE system message at the start of the
//                 conversation (verified across all 4 chatCompletion
//                 callers). Subsequent system messages, if any sneak in
//                 later, are appended as `role: "developer"` input items
//                 so the model still sees them.
//   tools       — chat-completions wrapped form
//                 [{ type: "function", function: { name, description, parameters } }]
//                 or undefined/empty for tool-less calls (risk-officer).
//   temperature — pass-through, except when `model` is codex-family on the
//                 Responses API, which rejects it.
//   model       — pass-through to the request body.
//
// Output is a plain object ready to JSON.stringify. `tools` is omitted
// entirely when none are provided so the responses API doesn't reject
// an empty array.
export function translateToResponsesRequest({ messages, tools, temperature, model }) {
  let instructions;
  const inputMessages = [];

  const list = Array.isArray(messages) ? messages : [];
  for (const msg of list) {
    if (!msg || typeof msg !== "object") continue;
    const role = msg.role;

    if (role === "system") {
      // First system → instructions. Subsequent system messages → developer
      // input items (rare; the runner doesn't currently produce them, but
      // we don't want to silently drop them if a future caller does).
      if (instructions === undefined) {
        instructions = typeof msg.content === "string" ? msg.content : String(msg.content || "");
      } else {
        inputMessages.push({
          type: "message",
          role: "developer",
          content: [{ type: "input_text", text: String(msg.content || "") }],
        });
      }
      continue;
    }

    if (role === "user") {
      inputMessages.push({
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: String(msg.content || "") }],
      });
      continue;
    }

    if (role === "assistant") {
      // Assistant text (if any) is emitted as a message item BEFORE the
      // function_call items, mirroring the chronological order the
      // chat-completions API uses (text + tool_calls live on the same
      // message object but the model "thinks" before calling).
      if (typeof msg.content === "string" && msg.content.length > 0) {
        inputMessages.push({
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: msg.content }],
        });
      }
      const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
      for (const tc of toolCalls) {
        if (!tc || tc.type !== "function" || !tc.function) continue;
        inputMessages.push({
          type: "function_call",
          call_id: tc.id,
          name: tc.function.name,
          arguments:
            typeof tc.function.arguments === "string"
              ? tc.function.arguments
              : JSON.stringify(tc.function.arguments ?? {}),
        });
      }
      continue;
    }

    if (role === "tool") {
      inputMessages.push({
        type: "function_call_output",
        call_id: msg.tool_call_id,
        output: typeof msg.content === "string" ? msg.content : String(msg.content ?? ""),
      });
      continue;
    }
  }

  const body = {
    model,
    input: inputMessages,
    // store: false — the runner always resends the full conversation,
    // so server-side storage adds nothing but a privacy/audit surface.
    store: false,
  };
  if (instructions !== undefined) body.instructions = instructions;
  // gpt-5-codex / gpt-5.1-codex (and future reasoning-only models routed
  // here by name) reject `temperature` with HTTP 400. When an operator
  // forces a non-codex model onto the Responses path via
  // LLM_USE_RESPONSES_API=1, `temperature` is still valid — so we gate on
  // the model name, not the endpoint.
  if (typeof temperature === "number" && !modelRequiresResponsesApi(model)) {
    body.temperature = temperature;
  }

  // Tools: chat-completions wrapped → responses flat. The explicit
  // strict: false is load-bearing — without it the responses API
  // normalizes the schema (all fields required, additionalProperties:false),
  // which breaks MCP tools with optional params (e.g. wire_asset's
  // seedPriceUsd, propose_file_edit's various optional fields).
  if (Array.isArray(tools) && tools.length > 0) {
    body.tools = tools
      .map((t) => {
        if (!t || typeof t !== "object") return null;
        if (t.type === "function" && t.function && typeof t.function === "object") {
          return {
            type: "function",
            name: t.function.name,
            description: t.function.description || "",
            parameters: t.function.parameters || { type: "object", properties: {} },
            strict: false,
          };
        }
        // Pass through tools already in responses-flat shape unchanged.
        if (t.type === "function" && typeof t.name === "string") {
          return { strict: false, ...t };
        }
        return null;
      })
      .filter(Boolean);
  }

  return body;
}

// Pure helper: translate a /v1/responses response payload into the
// chat-completions-shape object the runner's existing call sites expect
// (`response.choices[0].message.{content,tool_calls}` plus
// `response.choices[0].finish_reason`). Reasoning items are dropped —
// the runner never surfaces chain-of-thought to MCP or memory.
//
// `call_id` from each function_call output item becomes the
// chat-completions `id`, which keeps `pushRejectedToolResponses` and
// the `role: "tool"` round-trip working without further changes.
export function translateFromResponsesResponse(json) {
  const outputItems = Array.isArray(json?.output) ? json.output : [];
  const textParts = [];
  const toolCalls = [];

  for (const item of outputItems) {
    if (!item || typeof item !== "object") continue;
    if (item.type === "message") {
      const contents = Array.isArray(item.content) ? item.content : [];
      for (const c of contents) {
        if (!c || typeof c !== "object") continue;
        if (c.type === "output_text" && typeof c.text === "string") {
          textParts.push(c.text);
        }
      }
      continue;
    }
    if (item.type === "function_call") {
      toolCalls.push({
        id: item.call_id || item.id,
        type: "function",
        function: {
          name: item.name,
          arguments:
            typeof item.arguments === "string"
              ? item.arguments
              : JSON.stringify(item.arguments ?? {}),
        },
      });
      continue;
    }
    // reasoning, refusal, tool_search, etc. → ignored.
  }

  const message = {
    role: "assistant",
    content: textParts.join(""),
  };
  // Match chat-completions semantics: omit tool_calls entirely when
  // none are present so `!choice.message.tool_calls?.length` keeps
  // working unchanged.
  if (toolCalls.length > 0) message.tool_calls = toolCalls;

  return {
    choices: [
      {
        index: 0,
        message,
        finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
      },
    ],
  };
}

const DRY_RUN = ["1", "true", "yes"].includes(
  (process.env.AGENT_DRY_RUN || "").toLowerCase()
);
const CONFIRM_WRITES = !["0", "false", "no"].includes(
  (process.env.AGENT_CONFIRM_WRITES || "").toLowerCase().trim()
);
const NON_INTERACTIVE_WRITE_EXECUTE = ["1", "true", "yes"].includes(
  (process.env.AGENT_NON_INTERACTIVE_WRITE_EXECUTE || "").toLowerCase().trim()
);
const MAX_TOOL_RESPONSE = parseInt(
  process.env.AGENT_MAX_TOOL_RESPONSE || "6000",
  10
);

// Risk-officer second-pass: defaults ON; set AGENT_RISK_OFFICER=0 to bypass
// (e.g. when running an agent that has no LLM budget for the extra call).
// The risk-officer prompt body is loaded from `agents/risk-officer.md` at
// startup; on read failure we fall back to DEFAULT_RISK_OFFICER_SYSTEM_PROMPT
// so a missing file never blocks a run.
const RISK_OFFICER_ENABLED = !["0", "false", "no"].includes(
  (process.env.AGENT_RISK_OFFICER || "").toLowerCase().trim(),
);

function loadRiskOfficerPrompt() {
  try {
    const p = resolve(PROJECT_ROOT, "agents", "risk-officer.md");
    if (!existsSync(p)) return DEFAULT_RISK_OFFICER_SYSTEM_PROMPT;
    const raw = readFileSync(p, "utf8");
    const { systemPrompt } = parseAgentMarkdown(raw);
    return systemPrompt && systemPrompt.length > 0
      ? systemPrompt
      : DEFAULT_RISK_OFFICER_SYSTEM_PROMPT;
  } catch {
    return DEFAULT_RISK_OFFICER_SYSTEM_PROMPT;
  }
}

// ---------------------------------------------------------------------------
// MCP Client — spawn one per server definition
// ---------------------------------------------------------------------------

async function spawnMcpClient(serverDef) {
  const envForServer = { PROJECT_ROOT };
  for (const key of serverDef.envPassthrough || []) {
    if (process.env[key] !== undefined) {
      envForServer[key] = process.env[key];
    }
  }

  const transport = new StdioClientTransport({
    command: serverDef.command,
    args: (serverDef.args || []).map((a) => resolve(PROJECT_ROOT, a)),
    env: { ...process.env, ...envForServer },
    cwd: PROJECT_ROOT,
  });

  const client = new Client({
    name: `agent-runner/${serverDef.name}`,
    version: "1.0.0",
  });
  await client.connect(transport);

  const toolsResult = await client.listTools();

  return { client, serverName: serverDef.name, tools: toolsResult.tools };
}

// ---------------------------------------------------------------------------
// LLM API with retry (server-hint-aware backoff on 429 / 5xx)
// Uses an OpenAI-compatible chat-completions endpoint (defaults to api.openai.com).
// ---------------------------------------------------------------------------

const RETRY_ATTEMPTS = 5;
const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 60_000;
// Small pad on top of server-provided hints to avoid landing exactly on the
// reset boundary (which sometimes still 429s).
const RETRY_HINT_PAD_MS = 250;

// RFC 7231 §7.1.3: Retry-After is either a non-negative integer number of
// seconds, or an HTTP-date. Returns ms or null. Negative / past dates → null.
function parseRetryAfterHeader(value, nowMs = Date.now()) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    return Math.round(seconds * 1000);
  }

  const dateMs = Date.parse(trimmed);
  if (Number.isNaN(dateMs)) return null;
  const deltaMs = dateMs - nowMs;
  return deltaMs > 0 ? deltaMs : 0;
}

// Parse the OpenAI error body hint, e.g. "Please try again in 1.913s" or
// "try again in 250ms". Returns ms or null.
function parseRetryHintFromBody(text) {
  if (!text || typeof text !== "string") return null;
  const msMatch = text.match(/try again in\s+(\d+(?:\.\d+)?)\s*ms\b/i);
  if (msMatch) {
    const ms = Number(msMatch[1]);
    return Number.isFinite(ms) && ms >= 0 ? Math.round(ms) : null;
  }
  const sMatch = text.match(/try again in\s+(\d+(?:\.\d+)?)\s*s\b/i);
  if (sMatch) {
    const seconds = Number(sMatch[1]);
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    return Math.round(seconds * 1000);
  }
  return null;
}

// Pick the wait time for a retry. Precedence:
//   1. Retry-After header (only meaningful for 429 in practice).
//   2. "try again in X" hint in the response body.
//   3. Exponential backoff with full jitter: random in [base, base * 2^attempt].
// Result is clamped to [0, maxMs]. Server hints are padded by RETRY_HINT_PAD_MS.
function computeRetryWaitMs({
  status,
  retryAfterHeader = null,
  errorBodyText = null,
  attempt,
  baseMs = RETRY_BASE_MS,
  maxMs = RETRY_MAX_MS,
  random = Math.random,
  nowMs = Date.now(),
}) {
  const clamp = (ms) => Math.min(Math.max(0, Math.round(ms)), maxMs);

  if (status === 429) {
    const headerMs = parseRetryAfterHeader(retryAfterHeader, nowMs);
    if (headerMs !== null) return clamp(headerMs + RETRY_HINT_PAD_MS);
    const bodyMs = parseRetryHintFromBody(errorBodyText);
    if (bodyMs !== null) return clamp(bodyMs + RETRY_HINT_PAD_MS);
  }

  const expCap = baseMs * Math.pow(2, Math.max(0, attempt));
  const jittered = baseMs + random() * Math.max(0, expCap - baseMs);
  return clamp(jittered);
}

// Operator escape hatch: force the responses API for the current run
// regardless of model name. Useful for testing the responses path against
// a chat-completions-compatible model (e.g. gpt-5) before flipping a new
// agent over. Defaults to off so trading agents stay on chat-completions.
const FORCE_RESPONSES_API = ["1", "true", "yes"].includes(
  (process.env.LLM_USE_RESPONSES_API || "").toLowerCase().trim()
);

// Returns true when the current run should POST to /v1/responses instead
// of /v1/chat/completions. Predicate is purely model-driven (see
// `modelRequiresResponsesApi`) plus the env-side override above.
function useResponsesApiForActiveModel() {
  if (FORCE_RESPONSES_API) return true;
  return modelRequiresResponsesApi(activeModel);
}

// Optional `stats` accumulator: if provided, retry count + total wait time are
// added to it so the caller can surface the wall-clock cost of 429/5xx retries
// separately from the agent turn counter (retries never consume turns).
async function chatCompletion(messages, tools, temperature, stats = null) {
  const useResponses = useResponsesApiForActiveModel();
  const endpoint = useResponses
    ? `${LLM_BASE_URL}/responses`
    : `${LLM_BASE_URL}/chat/completions`;
  const body = useResponses
    ? translateToResponsesRequest({
        messages,
        tools,
        temperature,
        model: activeModel,
      })
    : { model: activeModel, messages, tools, temperature };

  let lastError;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LLM_API_KEY}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const json = await res.json();
        return useResponses ? translateFromResponsesResponse(json) : json;
      }

      const text = await res.text();
      lastError = new Error(`LLM API ${res.status}: ${text}`);

      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt === RETRY_ATTEMPTS - 1) throw lastError;

      const retryAfterHeader =
        typeof res.headers?.get === "function"
          ? res.headers.get("retry-after")
          : null;
      const waitMs = computeRetryWaitMs({
        status: res.status,
        retryAfterHeader,
        errorBodyText: text,
        attempt,
      });
      const headerMs = parseRetryAfterHeader(retryAfterHeader);
      const bodyMs = parseRetryHintFromBody(text);
      const hint =
        headerMs !== null
          ? `header: ${headerMs}ms`
          : bodyMs !== null
            ? `body: ${bodyMs}ms`
            : "no hint";
      const label = res.status === 429 ? "OpenAI 429 (rate limit)" : `OpenAI ${res.status}`;
      console.log(
        `  ${label}, waiting ${waitMs}ms before retry ${attempt + 2}/${RETRY_ATTEMPTS} (${hint})...`
      );
      if (stats) {
        stats.retryCount = (stats.retryCount || 0) + 1;
        stats.retryWaitMs = (stats.retryWaitMs || 0) + waitMs;
      }
      await new Promise((r) => setTimeout(r, waitMs));
    } catch (err) {
      if (err === lastError) throw err;
      lastError = err;
      if (attempt === RETRY_ATTEMPTS - 1) throw err;
      const waitMs = computeRetryWaitMs({
        status: 0,
        attempt,
      });
      console.log(
        `  LLM error: ${err.message}, waiting ${waitMs}ms before retry ${attempt + 2}/${RETRY_ATTEMPTS}...`
      );
      if (stats) {
        stats.retryCount = (stats.retryCount || 0) + 1;
        stats.retryWaitMs = (stats.retryWaitMs || 0) + waitMs;
      }
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Convert MCP tools to OpenAI function-calling format
// ---------------------------------------------------------------------------

function mcpToolsToOpenAI(mcpTools) {
  return mcpTools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description || "",
      parameters: t.inputSchema || { type: "object", properties: {} },
    },
  }));
}

// ---------------------------------------------------------------------------
// Token budget: truncate tool responses for the LLM context
// ---------------------------------------------------------------------------

function truncateForLLM(content) {
  if (content.length <= MAX_TOOL_RESPONSE) return content;
  return (
    content.slice(0, MAX_TOOL_RESPONSE) +
    "\n... [truncated — response exceeded budget. Use a more specific tool or params to get focused data.]"
  );
}

function computeAutoAllocationAmount(vaultState, autoAllocateTargetBps) {
  if (!vaultState || autoAllocateTargetBps <= 0) return 0n;
  const availableRaw = parseBigIntish(vaultState.availableForPerp) ?? 0n;
  if (availableRaw <= 0n) return 0n;
  return (availableRaw * BigInt(autoAllocateTargetBps)) / 10_000n;
}

// Normalises a `get_oracle_assets` response into a `[{ assetId, symbol }]`
// array regardless of whether the LLM called it with `compact: true` or not.
// The compact response shape (see apps/mcps/vault-manager/index.js:583-632)
// intentionally omits the full `assets[]` array to fit inside the agent's
// tool-response budget; it returns `{ count, summary: { symbols,
// activeSymbols, symbolToAssetId } }` only. Earlier versions of the
// eligibility helpers below short-circuited to `[]` whenever
// `oracleAssets.assets` was not an array, which trapped the mining-manager
// in a `set_vault_assets` enforcement loop until `maxTurns`: `eligibleAssets`
// stayed at zero forever even after the on-chain tracked set was correct.
// Returning a minimal `{ assetId, symbol }` projection is sufficient because
// the eligibility helpers only consume those two fields.
function normalizeOracleAssets(oracleAssets) {
  if (Array.isArray(oracleAssets?.assets)) return oracleAssets.assets;
  const map = oracleAssets?.summary?.symbolToAssetId;
  if (map && typeof map === "object") {
    return Object.entries(map)
      .filter(([symbol, assetId]) => symbol && assetId)
      .map(([symbol, assetId]) => ({ symbol, assetId }));
  }
  return null;
}

function getEligibleMomentumVolumeAssets({ policy, vaultState, oracleAssets, quotes }) {
  const oracleAssetList = normalizeOracleAssets(oracleAssets);
  if (
    !policy?.enabled ||
    policy.entryMode !== "momentum_volume" ||
    !vaultState ||
    !Array.isArray(vaultState.assets) ||
    !oracleAssetList ||
    !Array.isArray(quotes)
  ) {
    return [];
  }

  const trackedAssetIds = new Set(vaultState.assets.map((a) => String(a).toLowerCase()));
  const oracleBySymbol = new Map();
  for (const asset of oracleAssetList) {
    const symbol = String(asset.symbol || "").toUpperCase();
    if (!symbol) continue;
    if (!trackedAssetIds.has(String(asset.assetId || "").toLowerCase())) continue;
    oracleBySymbol.set(symbol, asset);
  }

  const eligible = [];
  for (const q of quotes) {
    if (!q || q.error) continue;
    const volume = Number(q.volume ?? 0);
    const dayChangePct = Number(q.dayChangePct ?? 0);
    if (!Number.isFinite(volume) || !Number.isFinite(dayChangePct)) continue;
    if (volume < policy.entryVolumeMin) continue;
    if (dayChangePct < policy.entryMomentumPctMin) continue;

    const symbolsToTry = [
      String(q.resolvedSymbol || "").toUpperCase(),
      String(q.symbol || "").toUpperCase(),
      String(q.requestedSymbol || "").toUpperCase(),
    ].filter(Boolean);
    const oracleAsset = symbolsToTry.map((s) => oracleBySymbol.get(s)).find(Boolean);
    if (!oracleAsset) continue;

    eligible.push({
      assetId: oracleAsset.assetId,
      symbol: oracleAsset.symbol,
      dayChangePct,
      volume,
      quoteSymbol: q.symbol || q.requestedSymbol || oracleAsset.symbol,
    });
  }

  const seen = new Set();
  return eligible.filter((item) => {
    const key = String(item.assetId).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getEligibleQualityScoreAssets({ policy, vaultState, oracleAssets, qualityPicks }) {
  const oracleAssetList = normalizeOracleAssets(oracleAssets);
  if (
    !policy?.enabled ||
    policy.entryMode !== "quality_score" ||
    !vaultState ||
    !Array.isArray(vaultState.assets) ||
    !oracleAssetList ||
    !Array.isArray(qualityPicks)
  ) {
    return [];
  }

  const trackedAssetIds = new Set(vaultState.assets.map((a) => String(a).toLowerCase()));
  const oracleBySymbol = new Map();
  for (const asset of oracleAssetList) {
    const symbol = String(asset.symbol || "").toUpperCase();
    if (!symbol) continue;
    if (!trackedAssetIds.has(String(asset.assetId || "").toLowerCase())) continue;
    oracleBySymbol.set(symbol, asset);
  }

  const minScore = Number(policy.entryQualityScoreMin ?? 0);
  const eligible = [];
  for (const pick of qualityPicks) {
    if (!pick) continue;
    const compositeScore = pickQualityEntryScore(pick);
    if (!Number.isFinite(compositeScore) || compositeScore < minScore) continue;
    const yahooSymbol = String(pick.yahooSymbol || "").toUpperCase();
    if (!yahooSymbol) continue;
    const oracleAsset = oracleBySymbol.get(yahooSymbol);
    if (!oracleAsset) continue;
    eligible.push({
      assetId: oracleAsset.assetId,
      symbol: oracleAsset.symbol,
      compositeScore,
      tradeReadinessScore: pick.tradeReadinessScore ?? null,
      tier: pick.tier ?? null,
      primaryCommodity: pick.primaryCommodity ?? null,
      daysSinceLastDrillRelease: pick.timing?.freshness?.daysSinceLastDrillRelease ?? null,
    });
  }

  const seen = new Set();
  const deduped = eligible.filter((item) => {
    const key = String(item.assetId).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const cap = Math.max(0, Number(policy.maxTrackedAssets ?? 0));
  if (cap > 0 && deduped.length > cap) return deduped.slice(0, cap);
  return deduped;
}

function getEligibleMlScoreAssets({ policy, vaultState, oracleAssets, mlPicks }) {
  const oracleAssetList = normalizeOracleAssets(oracleAssets);
  if (
    !policy?.enabled ||
    policy.entryMode !== "ml_score" ||
    !vaultState ||
    !Array.isArray(vaultState.assets) ||
    !oracleAssetList ||
    !Array.isArray(mlPicks)
  ) {
    return [];
  }

  const trackedAssetIds = new Set(vaultState.assets.map((a) => String(a).toLowerCase()));
  const oracleBySymbol = new Map();
  for (const asset of oracleAssetList) {
    const symbol = String(asset.symbol || "").toUpperCase();
    if (!symbol) continue;
    if (!trackedAssetIds.has(String(asset.assetId || "").toLowerCase())) continue;
    oracleBySymbol.set(symbol, asset);
  }

  const minScore = Number(policy.entryMlScoreMin ?? 0);
  const eligible = [];
  for (const pick of mlPicks) {
    if (!pick) continue;
    const mlScore = Number(pick.mlScore ?? 0);
    if (!Number.isFinite(mlScore) || mlScore < minScore) continue;
    const yahooSymbol = String(pick.yahooSymbol || "").toUpperCase();
    if (!yahooSymbol) continue;
    const oracleAsset = oracleBySymbol.get(yahooSymbol);
    if (!oracleAsset) continue;
    eligible.push({
      assetId: oracleAsset.assetId,
      symbol: oracleAsset.symbol,
      mlScore,
      mlPredictedReturn: pick.mlPredictedReturn ?? null,
      primaryCommodity: pick.primaryCommodity ?? null,
    });
  }

  const seen = new Set();
  const deduped = eligible.filter((item) => {
    const key = String(item.assetId).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const cap = Math.max(0, Number(policy.maxTrackedAssets ?? 0));
  if (cap > 0 && deduped.length > cap) return deduped.slice(0, cap);
  return deduped;
}

// Returns the picks above the entry score gate, IGNORING whether they are
// already tracked by the vault. The existing `getEligible*ScoreAssets`
// helpers intersect picks with the on-chain tracked set, so they return []
// whenever the matrix rotates onto names that have not been wired/tracked
// yet — which silently disables the `needsEntry` enforcement and lets the
// LLM end the run without opening anything. This helper is the input to
// the `needsRoll` directive, which forces the LLM to wire missing picks,
// roll set_vault_assets onto the current top-N, and then open positions.
//
// Returns an array of `{ yahooSymbol, score, tier }`, capped at
// `maxTrackedAssets`. Returns [] when entryMode is not score-based.
function getActionablePicks({ policy, picks }) {
  if (!policy?.enabled || !Array.isArray(picks)) return [];
  const isQuality = policy.entryMode === "quality_score";
  const isMl = policy.entryMode === "ml_score";
  if (!isQuality && !isMl) return [];
  const minScore = Number(
    isQuality ? policy.entryQualityScoreMin ?? 0 : policy.entryMlScoreMin ?? 0,
  );
  const seen = new Set();
  const out = [];
  for (const pick of picks) {
    if (!pick) continue;
    const score = Number(
      isQuality
        ? pickQualityEntryScore(pick)
        : pick.mlScore ?? 0,
    );
    if (!Number.isFinite(score) || score < minScore) continue;
    const yahooSymbol = String(pick.yahooSymbol || "").toUpperCase();
    if (!yahooSymbol) continue;
    if (seen.has(yahooSymbol)) continue;
    seen.add(yahooSymbol);
    out.push({ yahooSymbol, score, tier: pick.tier ?? null });
  }
  const cap = Math.max(0, Number(policy.maxTrackedAssets ?? 0));
  if (cap > 0 && out.length > cap) return out.slice(0, cap);
  return out;
}

// Pure decision helper for the deterministic pre-LLM auto-rebalance pass.
// Given the list of open positions and the current Atlas ML top-N (as a set
// of eligible Yahoo symbols), returns the closures the runner should
// execute. Behaviour by direction:
//
//   - long_only: any short leg is closed (cleanup), and any long leg whose
//     symbol dropped out of the top-N is closed.
//   - long_short: only long legs are checked against the top-N. Short legs
//     are entirely owned by the LLM's TP/SL decisions and are never auto-
//     closed here.
//   - short_only: shorts are not gated by the long-side top-N, and any long
//     leg is closed (cleanup).
function computeAutoRebalanceClosures({ policy, positions, eligibleSymbols, minScore, cap, signalLabel = "ML top" }) {
  const direction = policy?.entryDirection || "long_only";
  const eligible = new Set(
    Array.from(eligibleSymbols || []).map((s) => String(s || "").toUpperCase()),
  );
  const closures = [];
  for (const pos of positions || []) {
    if (!pos?.exists) continue;

    if (direction === "long_only" && pos.isLong === false) {
      closures.push({ pos, reason: "long_only policy: closing short leg" });
      continue;
    }
    if (direction === "short_only" && pos.isLong === true) {
      closures.push({ pos, reason: "short_only policy: closing long leg" });
      continue;
    }

    // The top-N is a long-side signal (Atlas ML or Quality Matrix).
    // Only apply the "dropped from top-N" auto-exit to long legs.
    // Shorts are entirely owned by the LLM's TP/SL decisions.
    if (pos.isLong !== true) continue;

    const symbol = String(pos.symbol || "").toUpperCase();
    if (!symbol) continue;
    if (!eligible.has(symbol)) {
      closures.push({
        pos,
        reason: `dropped from ${signalLabel}-${cap} (score < ${minScore})`,
      });
    }
  }
  return closures;
}

// Pure decision helper for the new rank-swap auto-exit pass. Run AFTER
// `computeAutoRebalanceClosures` so dropouts are already handled. When the
// agent has open long legs that are still in the top-N but lower-ranked than
// fresh picks the vault hasn't entered yet AND there isn't enough free
// collateral to add the new picks, close the lowest-ranked-then-worst-PnL
// existing long legs to make room.
//
// Inputs:
//   - policy:              parsed agent policy (entryDirection, autoExitMode, etc.)
//   - positions:           output of `list_open_positions` (must include
//                            `symbol`, `isLong`, `unrealisedPnlPctOfCollateral`)
//   - rankedPicks:         `getActionablePicks` output (score-descending order,
//                            already capped at `maxTrackedAssets`)
//   - availableCollateralUsdc: BigInt or numeric-string of raw USDC free for new opens
//   - minSlotCollateralUsdc:   BigInt or numeric-string of the per-slot collateral
//                                the runner intends to deploy
//
// Output: array of `{ pos, reason }` closures, ordered worst-first.
//
// Direction handling matches `computeAutoRebalanceClosures`: in `long_short`
// (and `long_only`) we only rotate longs. In `short_only` we never rotate
// since the top-N is a long signal.
function computeRankSwapClosures({
  policy,
  positions,
  rankedPicks,
  availableCollateralUsdc,
  minSlotCollateralUsdc,
  positionOpenAgeMs,
}) {
  if (!policy?.enabled) return [];
  const autoExitMode = String(policy.autoExitMode || "none");
  if (!autoExitMode.includes("rank_swap")) return [];

  const direction = policy.entryDirection || "long_only";
  if (direction === "short_only") return [];

  const picks = Array.isArray(rankedPicks) ? rankedPicks : [];
  if (picks.length === 0) return [];

  const positionsList = Array.isArray(positions) ? positions : [];

  // Tag each open long with its top-N rank (1-indexed). Untracked legs
  // (still in the vault but no longer in the top-N) get `Infinity` and
  // will sort last — though those are typically handled by
  // `computeAutoRebalanceClosures` already.
  const pickRank = new Map();
  picks.forEach((p, idx) => {
    const sym = String(p.yahooSymbol || "").toUpperCase();
    if (sym && !pickRank.has(sym)) pickRank.set(sym, idx + 1);
  });

  const heldLongs = [];
  const heldLongSymbols = new Set();
  for (const pos of positionsList) {
    if (!pos?.exists) continue;
    if (pos.isLong !== true) continue;
    const symbol = String(pos.symbol || "").toUpperCase();
    if (!symbol) continue;
    heldLongs.push({
      pos,
      symbol,
      rank: pickRank.get(symbol) ?? Number.POSITIVE_INFINITY,
      pnlPct: Number.isFinite(pos.unrealisedPnlPctOfCollateral)
        ? Number(pos.unrealisedPnlPctOfCollateral)
        : 0,
    });
    heldLongSymbols.add(symbol);
  }

  const picksWanted = picks
    .map((p, idx) => ({
      yahooSymbol: String(p.yahooSymbol || "").toUpperCase(),
      rank: idx + 1,
    }))
    .filter((p) => p.yahooSymbol && !heldLongSymbols.has(p.yahooSymbol));
  if (picksWanted.length === 0) return [];

  let availableBn;
  let minSlotBn;
  try {
    availableBn = BigInt(String(availableCollateralUsdc ?? "0"));
    minSlotBn = BigInt(String(minSlotCollateralUsdc ?? "0"));
  } catch {
    return [];
  }
  // When the runner doesn't know the per-slot collateral target there's no
  // safe way to decide how many slots to free. Skip rather than guess.
  if (minSlotBn <= 0n) return [];

  const fitsNow = Number(availableBn / minSlotBn);
  const slotsToFree = Math.max(0, picksWanted.length - fitsNow);
  if (slotsToFree === 0) return [];

  const candidates = [...heldLongs].sort((a, b) => {
    if (a.rank !== b.rank) return b.rank - a.rank; // higher (worse) rank first
    return a.pnlPct - b.pnlPct; // tiebreaker: worst PnL first
  });

  const minHoldMs = Math.max(0, Number(policy.minHoldingHours ?? 0)) * 60 * 60 * 1000;
  const ageLookup = positionOpenAgeMs && typeof positionOpenAgeMs === "function"
    ? positionOpenAgeMs
    : null;

  const closures = [];
  let freed = 0;
  for (const candidate of candidates) {
    if (freed >= slotsToFree) break;
    const { pos, symbol, rank, pnlPct } = candidate;
    if (minHoldMs > 0 && ageLookup) {
      const ageMs = ageLookup(pos);
      if (ageMs !== null && ageMs < minHoldMs) {
        continue;
      }
    }
    const newcomer = picksWanted[freed];
    const rankLabel = Number.isFinite(rank) ? `#${rank}` : "off-top-N";
    const pnlLabel = `${(pnlPct * 100).toFixed(2)}%`;
    const reason = newcomer
      ? `rank rotation: closing ${rankLabel} ${symbol} (pnl ${pnlLabel}) to free room for #${newcomer.rank} ${newcomer.yahooSymbol}`
      : `rank rotation: closing ${rankLabel} ${symbol} (pnl ${pnlLabel})`;
    closures.push({ pos, reason });
    freed += 1;
  }
  return closures;
}

// Pure decision helper for the `pnl_band` auto-exit pass. Closes any leg
// whose `pnlBandOutcome` (computed by the MCP `list_open_positions` helper)
// reports a take-profit or stop-loss trigger. Direction-aware: in
// `long_short` mode shorts are LLM-owned, so the band exit only applies to
// longs by default; agents that want deterministic short-side TP/SL can opt
// in via `entryDirection: short_only` (or stay in `long_only`).
function computePnlBandClosures({ policy, positions }) {
  if (!policy?.enabled) return [];
  const autoExitMode = String(policy.autoExitMode || "none");
  if (!autoExitMode.includes("pnl_band")) return [];

  const direction = policy.entryDirection || "long_only";
  const tp = Number.isFinite(policy.takeProfitPct) ? policy.takeProfitPct : 0.08;
  const sl = Number.isFinite(policy.stopLossPct) ? policy.stopLossPct : 0.06;
  const closures = [];
  for (const pos of positions || []) {
    if (!pos?.exists) continue;
    if (direction === "long_short" && pos.isLong !== true) continue;
    if (direction === "long_only" && pos.isLong !== true) continue;
    if (direction === "short_only" && pos.isLong !== false) continue;

    const pnlFrac = Number(pos.unrealisedPnlPctOfCollateral);
    let outcome = String(pos.pnlBandOutcome || "");
    if (Number.isFinite(pnlFrac)) {
      if (pnlFrac >= tp) outcome = "above_take_profit";
      else if (pnlFrac <= -sl) outcome = "below_stop_loss";
    }
    if (outcome === "above_take_profit" || outcome === "below_stop_loss") {
      const pnlPct = Number.isFinite(pnlFrac)
        ? `${(pnlFrac * 100).toFixed(2)}%`
        : "unknown";
      closures.push({
        pos,
        reason: `pnl band ${outcome}: ${pos.symbol || pos.assetId} pnl ${pnlPct}`,
      });
    }
  }
  return closures;
}

function validatePolicyWriteBatch({
  classified,
  policy,
  opensExecutedSoFar,
  shortOpensExecutedSoFar = 0,
  eligibleAssets,
  marketRegime = null,
  longNewsBySymbol = null,
  assetIdToSymbol = null,
}) {
  if (!policy?.enabled || !classified?.hasWriteCalls) return null;

  const openCalls = classified.writeCalls.filter((c) => c.originalName === "open_position");
  if (openCalls.length === 0) return null;

  // Regime-based short gate: when the pre-LLM market-regime snapshot tags
  // the metals/miners tape as a squeeze risk (XME or GDX day-change >= +3%
  // = shortPenalty 2) refuse every new short. The agent gets the reason in
  // the rejection so the next turn can pivot to longs or skip the open.
  const shortPenalty = Number(marketRegime?.shortPenalty || 0);
  if (shortPenalty >= 2) {
    const shortOpens = openCalls.filter((c) => c.args?.isLong === false);
    if (shortOpens.length > 0) {
      const tickers = shortOpens
        .map((c) => String(c.args?.assetId || "").slice(0, 10) + "…")
        .join(", ");
      return (
        `Policy violation: shortPenalty=${shortPenalty} from get_market_regime (` +
        (marketRegime?.summary || "miners ETF day-change >= +3%") +
        `). All new short open_position calls are rejected this run with error_code SHORT_BLOCKED_BY_REGIME (tried: ${tickers}). ` +
        "Drop the short batch and revise the turn — either focus on longs above the score gate or skip new opens entirely."
      );
    }
  }

  // Direction gating: enforce per-direction rules. The Atlas-ML eligibility
  // check below applies only to long opens, since Atlas ranks longs and
  // shorts are LLM-judged from news context.
  if (policy.entryDirection === "long_only") {
    for (const call of openCalls) {
      if (call.args?.isLong !== true) {
        return "Policy violation: only long positions are allowed (entryDirection=long_only). Revise open_position calls with isLong=true.";
      }
    }
  } else if (policy.entryDirection === "short_only") {
    for (const call of openCalls) {
      if (call.args?.isLong !== false) {
        return "Policy violation: only short positions are allowed (entryDirection=short_only). Revise open_position calls with isLong=false.";
      }
    }
  }

  const longOpenCalls = openCalls.filter((c) => c.args?.isLong === true);
  const shortOpenCalls = openCalls.filter((c) => c.args?.isLong === false);

  const maxOpens = Math.max(0, Number(policy.maxNewPositionsPerRun || 0));
  if (opensExecutedSoFar + openCalls.length > maxOpens) {
    return `Policy violation: proposed open_position calls exceed maxNewPositionsPerRun=${maxOpens} (combined long+short cap).`;
  }

  const maxShorts = Math.max(0, Number(policy.maxNewShortsPerRun || 0));
  if (
    policy.entryDirection !== "long_only" &&
    shortOpensExecutedSoFar + shortOpenCalls.length > maxShorts
  ) {
    return `Policy violation: proposed short open_position calls exceed maxNewShortsPerRun=${maxShorts}.`;
  }

  // The Atlas-ML / Quality-Matrix / momentum eligibility filter applies only
  // to long opens. Shorts are gated by direction + count caps + the agent's
  // own news judgment, not by the long-side eligibility set.
  if (longOpenCalls.length === 0) return null;

  const filterLabel =
    policy.entryMode === "ml_score"
      ? "Atlas ML score"
      : policy.entryMode === "quality_score"
        ? "Quality Matrix tradeReadinessScore"
        : "momentum+volume";

  const eligibleIds = new Set((eligibleAssets || []).map((a) => String(a.assetId).toLowerCase()));
  if (eligibleIds.size === 0) {
    return `Policy violation: no assets currently meet ${filterLabel} criteria, so do not open new long positions.`;
  }
  for (const call of longOpenCalls) {
    const assetId = String(call.args?.assetId || "").toLowerCase();
    if (!eligibleIds.has(assetId)) {
      return `Policy violation: long open_position assetId is not in the current eligible set from ${filterLabel} filtering.`;
    }
  }

  if (
    policy.entryMode === "quality_score" &&
    policy.entryRequireLongNews &&
    longNewsBySymbol &&
    typeof longNewsBySymbol.get === "function"
  ) {
    for (const call of longOpenCalls) {
      const assetId = call.args?.assetId;
      let symbol = null;
      if (typeof assetIdToSymbol === "function") {
        symbol = assetIdToSymbol(assetId);
      }
      symbol = String(symbol || "").toUpperCase();
      if (!symbol) {
        return "Policy violation: cannot verify long news confirmation — symbol unknown for assetId.";
      }
      const news = longNewsBySymbol.get(symbol);
      if (!news?.qualifies) {
        return (
          `Policy violation: long open on ${symbol} requires a recent (<${policy.entryLongNewsMaxAgeDays}d) ` +
          "bullish or factual headline from yfinance_news. Scan news and quote the headline in justification, or skip this name."
        );
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Thesis extraction from LLM summary
// ---------------------------------------------------------------------------

function extractThesis(summaryText) {
  if (!summaryText) return null;
  const sectionMatch = summaryText.match(
    /(?:^|\n)#+?\s*(?:Vault\s+)?Thesis[:\s]*\n?([\s\S]*?)(?:\n#|\n\n\n|$)/i
  );
  if (sectionMatch) return sectionMatch[1].trim() || null;
  const inlineMatch = summaryText.match(
    /(?:^|\n)\*?\*?(?:Vault\s+)?Thesis\*?\*?:\s*(.+)/i
  );
  if (inlineMatch) return inlineMatch[1].trim() || null;
  return null;
}

// ---------------------------------------------------------------------------
// Build system prompt with vault context, memory, and dry-run notice
// ---------------------------------------------------------------------------

function buildSystemPrompt(config, state, recentRuns, needsNewVault, marketRegime = null) {
  let prompt = config.systemPrompt;

  // Skills (generalised tool/API references)
  if (config.skills.length > 0) {
    prompt += "\n\n---\n";
    prompt += config.skills.join("\n\n---\n\n");
  }

  // Vault context
  prompt += "\n\n## Your Vault\n";
  if (needsNewVault) {
    const name = config.vaultName || config.name;
    prompt +=
      `You do not have a vault yet. Your first action must be to create one:\n` +
      `- Call create_vault with name="${name}", depositFeeBps=${config.depositFeeBps}, redeemFeeBps=${config.redeemFeeBps}\n` +
      `- Use the returned vaultAddress from create_vault\n` +
      `- Then proceed with your normal workflow using that vault address.`;
  } else if (state?.vaultAddress) {
    prompt +=
      `Your vault address is: ${state.vaultAddress}\n` +
      `Vault name: ${state.vaultName || "unknown"}\n` +
      `Deployed: ${state.deployedAt || "unknown"}\n` +
      `Only operate on this vault. Do not touch other vaults.`;
  }

  // Recent run history
  if (recentRuns.length > 0) {
    prompt += "\n\n## Recent Run History\n";
    prompt += "Here are your most recent runs for context:\n\n";
    for (const run of recentRuns) {
      const actions =
        run.writeActions?.length > 0
          ? run.writeActions.map((a) => `${a.tool}${a.skipped ? " (skipped)" : ""}`).join(", ")
          : "none";
      prompt +=
        `- **${run.timestamp}**: ${run.turns} turns, actions: ${actions}` +
        (run.summary ? ` — ${run.summary.slice(0, 200)}` : "") +
        "\n";
    }
  }

  // Lessons block — top-3 winners / losers from `closedPositions[]` in the
  // recent run log. Emits an empty string when no usable data is available
  // so a fresh agent doesn't get an empty heading.
  const lessons = buildLessonsBlock({ runs: recentRuns });
  if (lessons) {
    prompt += `\n${lessons}`;
  }

  // Market regime tag — the pre-LLM pass calls get_market_regime once per
  // run and pins the result into the prompt so the LLM doesn't have to
  // remember to fetch it (and the prompt is consistent within the run even
  // if the metals tape moves mid-turn). The runner ALSO enforces the
  // short-side gate deterministically when shortPenalty >= 2 via
  // validatePolicyWriteBatch, so the line below is informational + lets the
  // LLM size its conviction weights against the tape.
  if (marketRegime && typeof marketRegime === "object") {
    const lines = ["", "## Today's Metals Regime"];
    if (marketRegime.summary) {
      lines.push(marketRegime.summary);
    } else {
      lines.push(`Regime: ${marketRegime.regime || "metals_neutral"}`);
    }
    const sp = Number(marketRegime.shortPenalty || 0);
    if (sp >= 2) {
      lines.push(
        "shortPenalty=2 — the runner will auto-block every new short open_position this run with `SHORT_BLOCKED_BY_REGIME`. Do not propose shorts; the rejection costs a turn.",
      );
    } else if (sp === 1) {
      lines.push(
        "shortPenalty=1 — proceed with shorts only on clear red-flag names (treasury risk, fatal drill miss, dilution); the runner does not auto-block at this level but the squeeze odds are elevated.",
      );
    } else {
      lines.push("shortPenalty=0 — no regime-based short blocking active.");
    }
    const lb = Number(marketRegime.longBonus || 0);
    if (lb >= 2) {
      lines.push(
        "longBonus=2 — miners deeply red on the day; consider upweighting long convictionWeights on top-quartile picks.",
      );
    }
    prompt += `\n${lines.join("\n")}`;
  }

  // Current vault thesis
  if (state?.thesis) {
    prompt += "\n\n## Current Vault Thesis\n";
    prompt += state.thesis + "\n";
    prompt += "Update this thesis in your final summary if the strategy has evolved.";
  }

  // Action justifications
  prompt += "\n\n## Action Justifications\n";
  prompt += "For every write tool call, include a `justification` argument: a 1-2 sentence explanation\n";
  prompt += "of why this action is being taken, citing market data or vault state that motivated it.\n";
  prompt += "This justification is surfaced to investors in the vault history UI.";

  // Dry-run notice
  const dryRunNotice = DRY_RUN
    ? "\n\n## Dry Run Mode\nDRY RUN IS ACTIVE: Report what you would do but do NOT call write tools."
    : "\n\n## Dry Run Mode\nLive mode: you may execute write operations.";
  prompt += dryRunNotice;

    if (config.policy?.enabled) {
      prompt += "\n\n## Enforced Policy";
      prompt += `\n- Auto allocation target from available idle USDC: ${config.policy.autoAllocateTargetBps} bps`;
      prompt += `\n- Entry mode: ${config.policy.entryMode}`;
      if (config.policy.entryMode === "ml_score") {
        prompt += `\n- Entry trigger: Atlas ML score >= ${config.policy.entryMlScoreMin}`;
        prompt += `\n- Max tracked assets in the basket: ${config.policy.maxTrackedAssets}`;
        prompt += `\n- Rebalance mode: ${config.policy.rebalanceMode}`;
      } else if (config.policy.entryMode === "quality_score") {
        prompt += `\n- Entry trigger: tradeReadinessScore >= ${config.policy.entryQualityScoreMin} (from get_quality_trade_ready_picks — includes freshness / priced-in filters)`;
        prompt += `\n- Max material signal age: ${config.policy.entryMaxSignalAgeDays} days`;
        prompt += `\n- Recency half-life: ${config.policy.entryRecencyHalfLifeDays} days`;
        prompt += `\n- Priced-in guard: skip when 5d return > ${config.policy.entryMaxRecent5dReturnPct}% or 20d > ${config.policy.entryMaxRecent20dReturnPct}%`;
        if (config.policy.entryRequireLongNews) {
          prompt += `\n- Long news: require bullish/factual headline within ${config.policy.entryLongNewsMaxAgeDays} days (quote in justification)`;
        }
        if (config.policy.minHoldingHours > 0) {
          prompt += `\n- Min holding before rank-swap exit: ${config.policy.minHoldingHours}h (dropout/PnL band still apply)`;
        }
        const tp = config.policy.takeProfitPct;
        const sl = config.policy.stopLossPct;
        if (tp !== null && sl !== null) {
          prompt += `\n- PnL bands: take profit +${(tp * 100).toFixed(0)}% / stop loss -${(sl * 100).toFixed(0)}% of collateral`;
        }
        prompt += `\n- Max tracked assets in the basket: ${config.policy.maxTrackedAssets}`;
        prompt += `\n- Rebalance mode: ${config.policy.rebalanceMode}`;
      } else if (config.policy.entryMode === "momentum_volume") {
        prompt += `\n- Entry trigger: dayChangePct >= ${config.policy.entryMomentumPctMin} and volume >= ${config.policy.entryVolumeMin}`;
      }
    prompt += `\n- Direction: ${config.policy.entryDirection}`;
    prompt += `\n- Max new positions per run (combined): ${config.policy.maxNewPositionsPerRun}`;
    if (config.policy.entryDirection === "long_short") {
      prompt += `\n- Max new SHORTS per run (subset of combined cap): ${config.policy.maxNewShortsPerRun}`;
    }
    prompt += `\n- Position sizing: ${config.policy.positionSizingMode}`;
  }

  return prompt;
}

// ---------------------------------------------------------------------------
// Extract vault address from tool responses
// ---------------------------------------------------------------------------

function extractVaultAddressFromCreateVaultResponse(content) {
  try {
    const data = JSON.parse(content);
    if (data && typeof data.vaultAddress === "string" && data.vaultAddress.startsWith("0x")) {
      return data.vaultAddress;
    }
  } catch {}
  return null;
}

// MCP error codes that represent the MCP correctly REFUSING an action (no tx
// submitted, structured payload with a `recovery_hint`). These are not
// failures in the "something broke" sense — they are policy/idempotency
// guards working as designed. We bucket them under `runSummary.softFailures`
// so the `errors[]` count + `FAILED (N errors)` commit subject only reflect
// failures the agent (or operator) should actually investigate.
const SOFT_REFUSAL_ERROR_CODES = new Set([
  "CHURN_GUARD_COOLDOWN",
  "ALREADY_WIRED",
  "INVALID_SYMBOL_POLICY",
  "MAX_POSITIONS_PER_RUN_EXCEEDED",
  "MAX_SHORTS_PER_RUN_EXCEEDED",
  "INSUFFICIENT_COLLATERAL",
  "INSUFFICIENT_RESERVES",
  "LEVERAGE_BELOW_1X",
]);

// Maximum characters preserved per MCP error before we elide the rest. The
// historical 500-char cap silently chopped revert payloads mid-JSON,
// hiding `recovery_hint`, `assetId`, and the structured fields the
// self-improvement detector relies on. 8 KB fits every observed MCP error
// payload (REQUIRE_REVERT cast output is the largest at ~2 KB) while
// keeping run-log JSONL files bounded. Operators can override via
// `AGENT_RUNNER_MCP_ERROR_MAX_CHARS` if a future MCP starts emitting
// larger payloads.
const MCP_ERROR_MAX_CHARS = (() => {
  const raw = process.env.AGENT_RUNNER_MCP_ERROR_MAX_CHARS;
  const parsed = Number.parseInt(raw || "", 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 8000;
})();

// Pure helper: classify an MCP error payload as soft (policy refusal, no
// tx submitted, recoverable) or hard (revert, schema validation, RPC
// failure). Free-text errors default to hard because we cannot prove the
// MCP refused safely.
function classifyMcpErrorPayload(content) {
  const raw = String(content ?? "");
  if (!raw.trim()) return { code: null, isSoft: false };
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { code: null, isSoft: false };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { code: null, isSoft: false };
  }
  const code = typeof parsed.error_code === "string" ? parsed.error_code : null;
  if (code && SOFT_REFUSAL_ERROR_CODES.has(code)) {
    return { code, isSoft: true };
  }
  // Generic soft heuristic: success:false with a recovery_hint and no tx
  // submitted. Matches future MCP refusals we haven't enumerated yet.
  if (
    parsed.success === false &&
    typeof parsed.recovery_hint === "string" &&
    parsed.recovery_hint.length > 0 &&
    !parsed.transactionHash
  ) {
    return { code, isSoft: true };
  }
  return { code, isSoft: false };
}

// Pure helper for executeToolCall: inspects an MCP tool response and, if it
// signals failure via the MCP `isError: true` convention, records it on the
// shared run summary + policy runtime. Returns true iff the response was an
// error, so the caller can branch (e.g. skip vault-address capture from a
// follow-up get_all_vaults). Exported via __agentRunnerInternals for tests.
//
// Failures are split into two buckets:
//   - `runSummary.errors[]`        — hard failures (reverts, schema errors,
//                                    RPC failures). These drive `FAILED (N)`
//                                    in the commit subject and feed the
//                                    self-improvement `new_error_code` /
//                                    `recurring_error_code` detectors.
//   - `runSummary.softFailures[]`  — policy refusals / idempotency skips
//                                    that did NOT submit a tx and ship a
//                                    `recovery_hint`. Surfaced in the
//                                    commit body as a tally only.
function recordMcpErrorIfPresent({
  result,
  content,
  runSummary,
  policyRuntime,
  toolName,
  originalName,
}) {
  if (result?.isError !== true) return false;
  const raw = String(content ?? "");
  const elided = raw.length > MCP_ERROR_MAX_CHARS
    ? raw.slice(0, MCP_ERROR_MAX_CHARS) +
      `\n... [truncated ${raw.length - MCP_ERROR_MAX_CHARS} chars; raise AGENT_RUNNER_MCP_ERROR_MAX_CHARS to see more]`
    : raw;
  const classification = classifyMcpErrorPayload(raw);
  const entry = { tool: toolName, error: elided };
  if (classification.code) entry.errorCode = classification.code;
  if (classification.isSoft) {
    if (!Array.isArray(runSummary.softFailures)) runSummary.softFailures = [];
    runSummary.softFailures.push(entry);
  } else {
    runSummary.errors.push(entry);
  }
  // create_vault failures always arm the suppression flag regardless of
  // classification: even a soft refusal (e.g. policy guard rejected a
  // proposed vault name) must prevent the get_all_vaults fallback from
  // capturing a sibling agent's vault address.
  if (originalName === "create_vault" && policyRuntime) {
    policyRuntime.createVaultFailedThisRun = true;
  }
  return true;
}

// Look up an address in the get_all_vaults response. When `vaultName` is
// provided we require an exact (case-insensitive) name match — there is NO
// fallback to "newest vault" because that fallback caused cross-agent vault
// contamination on 2026-05-21: a failed create_vault for "Minestarters Quality
// Matrix" silently inherited the sibling mining-manager's vault address (the
// most recently created basket in the factory list) and persisted it to the
// agent's state.json. Only when the caller has no expected name (legacy
// untargeted lookup) does the function fall back to the newest entry.
function extractNewestVaultAddress(content, vaultName) {
  try {
    const data = JSON.parse(content);
    if (data.vaults && Array.isArray(data.vaults) && data.vaults.length > 0) {
      if (vaultName) {
        const match = data.vaults.find(
          (v) => v.name && v.name.toLowerCase() === vaultName.toLowerCase()
        );
        return match ? match.address : null;
      }
      return data.vaults[data.vaults.length - 1].address;
    }
  } catch {}
  return null;
}

// Pure helper for the startup vault-identity guardrail. Compares the
// `name()` returned by the on-chain `BasketVault` (via `get_vault_state`)
// against the agent's configured `vaultName`. Returns one of:
//
//   { ok: true }                      — names match (case + whitespace insensitive)
//   { ok: true, skipped: true }       — no `expectedName` configured (legacy agent)
//   { ok: false, reason, error }      — mismatch or unverifiable on-chain name
//
// This is the second line of defence after the 2026-05-21 cross-agent
// contamination fix in commit 00cfb07: even if a future bug, manual edit,
// or bad CI artifact restores a wrong `vaultAddress` in `state.json`, the
// runner refuses to start instead of silently trashing a sibling agent's
// vault. The first line of defence prevents the bad address from being
// captured in the first place; this one prevents acting on it after the
// fact. Exported via __agentRunnerInternals for tests.
function verifyVaultNameMatch({ onChainName, expectedName, vaultAddress, agentName }) {
  if (!expectedName) {
    return { ok: true, skipped: true };
  }

  const normalized = (value) =>
    typeof value === "string" ? value.trim().toLowerCase() : "";
  const actual = normalized(onChainName);
  const expected = normalized(expectedName);

  if (!actual) {
    const reason = "missing-onchain-name";
    return {
      ok: false,
      reason,
      error:
        `[VAULT IDENTITY] Refusing to run: could not read an on-chain name() for vault ${vaultAddress ?? "(unknown address)"} ` +
        `(get_vault_state returned no usable \`name\` field). This agent (${agentName ?? "(unknown)"}) is configured for ` +
        `vault name "${expectedName}". Inspect the vault deployment and agent memory before retrying.`,
    };
  }

  if (actual !== expected) {
    const reason = "name-mismatch";
    return {
      ok: false,
      reason,
      error:
        `[VAULT IDENTITY] Refusing to run: state.json points at ${vaultAddress ?? "(unknown address)"} whose on-chain ` +
        `name is "${onChainName}", but this agent (${agentName ?? "(unknown)"}) is configured for vault name ` +
        `"${expectedName}". This usually means agent memory was corrupted by a failed create_vault followed by a ` +
        `fallback to the wrong factory entry. Clear agents/memory/${agentName ?? "<agent>"}/state.json to let the ` +
        `agent deploy a fresh vault on the next run.`,
    };
  }

  return { ok: true };
}

function renderToolCallLine(call) {
  return `- ${call.toolName}(${JSON.stringify(call.args)})`;
}

function parseWriteConfirmationCommand(rawInput) {
  const input = String(rawInput ?? "").trim();
  if (!input) return { input: "", command: "approve" };
  return { input, command: input.toLowerCase() };
}

// OpenAI's Chat Completions API requires that every assistant message
// containing `tool_calls` is followed by `role: "tool"` messages — one per
// `tool_call_id` — before any further `role: "user"` or `role: "assistant"`
// message. The runner's pre-LLM policy guards (bad `allocate_to_perp`
// amount=0, `validatePolicyWriteBatch` violations) reject a write batch
// without ever executing the tools, so they short-circuit before
// `executeToolCall` would have pushed the matching tool responses. Without
// this helper, the next `chatCompletion` call crashes with:
//   "An assistant message with 'tool_calls' must be followed by tool
//    messages responding to each 'tool_call_id'. The following
//    tool_call_ids did not have response messages: call_..."
// (Reproduced on the 2026-05-22 quality-matrix-manager run: turn 13 emitted
// a policy violation, turn 14 crashed with HTTP 400.)
//
// Call this immediately after `messages.push(choice.message)` for any
// branch that wants to discard the LLM's proposed tool batch and replace
// it with a `role: "user"` directive. Exported via __agentRunnerInternals
// so tests can assert the invariant directly.
function pushRejectedToolResponses(messages, toolCalls, reason) {
  if (!Array.isArray(toolCalls)) return;
  for (const tc of toolCalls) {
    if (!tc || typeof tc.id !== "string" || !tc.id) continue;
    messages.push({
      role: "tool",
      tool_call_id: tc.id,
      content: JSON.stringify({
        success: false,
        rejected: true,
        reason: typeof reason === "string" ? reason : String(reason ?? ""),
      }),
    });
  }
}

async function confirmWriteBatchInteractively({
  initialChoice,
  initialClassified,
  turn,
  messages,
  openaiTools,
  temperature,
  writeTools,
}) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let currentChoice = initialChoice;
  let currentClassified = initialClassified;
  let refinementRounds = 0;

  try {
    while (true) {
      if (!currentClassified.hasWriteCalls) {
        return {
          status: "revised_no_writes",
          choice: currentChoice,
          classified: currentClassified,
          refinementRounds,
        };
      }

      console.log("\n=== Write Confirmation Required ===");
      console.log(
        `Turn ${turn}: proposed ${currentClassified.writeCalls.length} write call(s):`
      );
      for (const writeCall of currentClassified.writeCalls) {
        console.log(`  ${renderToolCallLine(writeCall)}`);
      }
      if (currentClassified.readCalls.length > 0) {
        console.log("  (This batch also includes read tool calls.)");
      }

      const rawInput = await rl.question(
        "Press Enter to approve, type 'reject' to skip writes, or provide feedback for revision: "
      );
      const { input, command } = parseWriteConfirmationCommand(rawInput);

      if (command === "approve") {
        return {
          status: "approved",
          choice: currentChoice,
          classified: currentClassified,
          refinementRounds,
        };
      }

      if (command === "reject") {
        return {
          status: "rejected",
          choice: currentChoice,
          classified: currentClassified,
          refinementRounds,
        };
      }

      refinementRounds += 1;
      const feedback =
        input ||
        "Revise this write batch with safer and better-justified actions.";
      const proposedCalls = currentClassified.calls
        .map((call) => renderToolCallLine(call))
        .join("\n");

      messages.push({
        role: "user",
        content:
          "Operator feedback on your proposed tool-call batch:\n" +
          `${feedback}\n\n` +
          "Your last proposed calls were:\n" +
          `${proposedCalls}\n\n` +
          "Revise your plan. If writes are still needed, emit revised tool calls.",
      });

      const revisedResponse = await chatCompletion(
        messages,
        openaiTools,
        temperature
      );
      currentChoice = revisedResponse.choices[0];

      if (
        currentChoice.finish_reason === "stop" ||
        !currentChoice.message.tool_calls?.length
      ) {
        return {
          status: "revised_no_tools",
          choice: currentChoice,
          classified: null,
          refinementRounds,
        };
      }

      currentClassified = classifyToolCalls(
        currentChoice.message.tool_calls,
        writeTools
      );
    }
  } finally {
    rl.close();
  }
}

// ---------------------------------------------------------------------------
// Publish agent metadata for web app consumption
// ---------------------------------------------------------------------------

const AGENT_METADATA_ACTION_LIMIT_DEFAULT = 100;

// Per-tool params summary surfaced in the AI Activity panel. We deliberately
// drop the `vault` address and `justification` (already on the parent action)
// and only keep human-meaningful fields. Unknown tools produce no params so
// the UI can fall back to the justification only.
function summarizeActionParams(tool, args) {
  if (!args || typeof args !== "object") return undefined;
  switch (tool) {
    case "wire_asset":
      if (typeof args.symbol !== "string") return undefined;
      return {
        kind: "wire_asset",
        symbol: args.symbol,
        ...(typeof args.seedPriceUsd === "number"
          ? { seedPriceUsd: args.seedPriceUsd }
          : {}),
      };
    case "create_vault":
      if (typeof args.name !== "string") return undefined;
      return {
        kind: "create_vault",
        name: args.name,
        depositFeeBps: Number(args.depositFeeBps) || 0,
        redeemFeeBps: Number(args.redeemFeeBps) || 0,
        ...(typeof args.deployToSpokes === "boolean"
          ? { deployToSpokes: args.deployToSpokes }
          : {}),
      };
    case "set_vault_assets": {
      if (!Array.isArray(args.assetIds)) return undefined;
      const assetIds = args.assetIds.filter((v) => typeof v === "string");
      return {
        kind: "set_vault_assets",
        assetIds,
        count: assetIds.length,
      };
    }
    case "allocate_to_perp":
    case "withdraw_from_perp":
      if (typeof args.amount !== "string") return undefined;
      return {
        kind: tool,
        amountUsdc: args.amount,
      };
    case "open_position":
      if (typeof args.assetId !== "string") return undefined;
      return {
        kind: "open_position",
        assetId: args.assetId,
        isLong: Boolean(args.isLong),
        size: typeof args.size === "string" ? args.size : String(args.size ?? ""),
        collateral: typeof args.collateral === "string"
          ? args.collateral
          : String(args.collateral ?? ""),
      };
    case "close_position":
      if (typeof args.assetId !== "string") return undefined;
      return {
        kind: "close_position",
        assetId: args.assetId,
        isLong: Boolean(args.isLong),
        sizeDelta: typeof args.sizeDelta === "string"
          ? args.sizeDelta
          : String(args.sizeDelta ?? ""),
        collateralDelta: typeof args.collateralDelta === "string"
          ? args.collateralDelta
          : String(args.collateralDelta ?? ""),
      };
    default:
      return undefined;
  }
}

function publishAgentMetadata(config, currentState, runSummary) {
  if (!currentState?.vaultAddress) return;
  const metaDir = resolve(PROJECT_ROOT, "apps/web/public/agent-metadata");
  mkdirSync(metaDir, { recursive: true });
  const addr = currentState.vaultAddress.toLowerCase();
  const metaPath = resolve(metaDir, `${addr}.json`);

  const runId = runSummary.finishedAt;

  const recentActions = (runSummary.writeActions || [])
    .filter((a) => !a.skipped && a.justification)
    .map((a) => {
      const params = summarizeActionParams(a.tool, a.args);
      return {
        tool: a.tool,
        justification: a.justification,
        timestamp: runSummary.finishedAt,
        txHash: a.txHash || null,
        agentName: config.name,
        runId,
        ...(params ? { params } : {}),
        // Risk-officer verdict (approve | downsize | veto) + reason +
        // per-call downsize audit (when the officer rescaled this open).
        // The web UI's "Show all decisions" panel renders this next to the
        // tx so investors can see the second-pass commentary.
        ...(a.riskOfficer ? { riskOfficer: a.riskOfficer } : {}),
      };
    });

  let existing = { recentActions: [] };
  if (existsSync(metaPath)) {
    try {
      existing = JSON.parse(readFileSync(metaPath, "utf8"));
    } catch {}
  }

  // Dedupe by txHash (preferred) or timestamp+tool to avoid older justified
  // rows being pushed out by repeated runs that re-emit the same actions.
  const merged = [...recentActions, ...(existing.recentActions || [])];
  const seen = new Set();
  const deduped = [];
  for (const a of merged) {
    const key = a.txHash
      ? `tx:${String(a.txHash).toLowerCase()}`
      : `tt:${a.timestamp}|${a.tool}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(a);
  }
  const cap =
    Number(process.env.AGENT_METADATA_ACTION_LIMIT) ||
    AGENT_METADATA_ACTION_LIMIT_DEFAULT;
  const allActions = deduped.slice(0, cap);

  const latestRun = {
    runId,
    finishedAt: runSummary.finishedAt,
    summary: runSummary.summary || "",
  };

  const usesAtlasMl = Array.isArray(config.mcpServers)
    && config.mcpServers.some((s) => s?.name === "atlas-ml-mcp");
  const usesAtlasQuality = Array.isArray(config.mcpServers)
    && config.mcpServers.some((s) => s?.name === "atlas-quality-mcp");
  const signalSource = usesAtlasQuality
    ? "atlas-quality"
    : usesAtlasMl
      ? "atlas-ml"
      : null;

  const metadata = {
    isAiManaged: true,
    agentName: config.name,
    agentDescription: config.description,
    signalSource,
    entryMode: config.policy?.entryMode || null,
    thesis: currentState.thesis || null,
    lastRunAt: runSummary.finishedAt,
    latestRun,
    recentActions: allActions,
  };

  // SECURITY: this file is committed back to the default branch via the
  // `commit-results` job in vault-agent.yml, so we deep-redact any secret
  // material that may have slipped into the LLM-authored thesis/summary or
  // a write-action justification before persisting.
  writeFileSync(metaPath, JSON.stringify(redactSecretsDeep(metadata), null, 2) + "\n");
  console.log(`Metadata: published to ${metaPath}`);
}

// Paperclip bridge: write a per-agent `paperclip-heartbeat.json` snapshot
// into `agents/memory/<agent>/` so the operator's Paperclip install can
// ingest it on its daily sync as the `resultJson` mirror for the latest
// heartbeat run. See `COMPANY.md` and `docs/AGENTS_FRAMEWORK.md`
// §Paperclip Integration. Written unconditionally per run (not vault-
// scoped) so non-trading agents like `self-improver-issues` and
// `issue-implementer` are visible to Paperclip too.
function publishPaperclipHeartbeat({ config, state, runSummary, network, status }) {
  const dir = agentMemoryDir(config.name);
  mkdirSync(dir, { recursive: true });
  const heartbeatPath = resolve(dir, "paperclip-heartbeat.json");

  const usesAtlasMl = Array.isArray(config.mcpServers)
    && config.mcpServers.some((s) => s?.name === "atlas-ml-mcp");
  const usesAtlasQuality = Array.isArray(config.mcpServers)
    && config.mcpServers.some((s) => s?.name === "atlas-quality-mcp");
  const signalSource = usesAtlasQuality
    ? "atlas-quality"
    : usesAtlasMl
      ? "atlas-ml"
      : null;

  const writeActions = (runSummary.writeActions || [])
    .filter((a) => !a.skipped)
    .map((a) => ({
      tool: a.tool,
      txHash: a.txHash || null,
      justification: a.justification || null,
      ...(a.riskOfficer ? { riskOfficer: a.riskOfficer } : {}),
    }));

  const errors = (runSummary.errors || []).map((e) => ({
    tool: e.tool,
    error:
      typeof e.error === "string"
        ? e.error.slice(0, 500)
        : String(e.error || "").slice(0, 500),
  }));

  const payload = {
    schema: "paperclip.heartbeat/v1",
    agentName: config.name,
    agentDescription: config.description || "",
    signalSource,
    entryMode: config.policy?.entryMode || null,
    network: network || null,
    vaultAddress: state?.vaultAddress || null,
    vaultName: state?.vaultName || config.vaultName || null,
    runId: runSummary.finishedAt,
    startedAt: runSummary.startedAt || null,
    finishedAt: runSummary.finishedAt || null,
    status: status || (errors.length > 0 ? "failed" : "succeeded"),
    usage: {
      turns: runSummary.turns || 0,
      toolCalls: Array.isArray(runSummary.toolCalls)
        ? runSummary.toolCalls.length
        : 0,
      errors: errors.length,
      softFailures: Array.isArray(runSummary.softFailures)
        ? runSummary.softFailures.length
        : 0,
      writeActions: writeActions.length,
    },
    thesis: state?.thesis || null,
    summary: runSummary.summary || "",
    writeActions,
    errors,
  };

  // SECURITY: this file is committed back to the default branch via the
  // `commit-results` job in vault-agent.yml, so we deep-redact the entire
  // payload before persisting — secrets may have slipped into the
  // LLM-authored thesis/summary or a write-action justification.
  writeFileSync(
    heartbeatPath,
    JSON.stringify(redactSecretsDeep(payload), null, 2) + "\n",
  );
  console.log(`Paperclip: heartbeat published to ${heartbeatPath}`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function runAgent(agentName) {
  if (!LLM_API_KEY) {
    console.error("LLM_API_KEY is required");
    process.exit(1);
  }

  console.log(`\n[LLM Backend] OpenAI-compatible API`);
  console.log(`  Endpoint: ${LLM_BASE_URL}`);
  console.log(`  Model (global env): ${LLM_MODEL}`);

  const config = loadAgentConfig(agentName);
  const runNetwork = resolveRunNetworkKey();
  const runLogFile = `run-log.${runNetwork}.jsonl`;
  const deploymentContext = buildDeploymentFingerprint(runNetwork);
  const maxTurns = parseInt(
    process.env.AGENT_MAX_TURNS || String(config.maxTurns),
    10
  );

  // Resolve and lock in the per-agent model BEFORE any `chatCompletion`
  // call. `frontmatter.model` wins over `LLM_MODEL_<AGENT>` over the
  // global `LLM_MODEL`. The resolver is pure; setActiveModel mutates
  // the module-scoped slot that `chatCompletion` reads.
  const modelResolution = resolveAgentModel({
    agentName: config.name,
    frontmatter: { model: config.model },
  });
  setActiveModel(modelResolution);

  // Propagate AGENT_NAME into the environment so MCP servers spawned below
  // can tag shared-memory writes (news cache + recently-closed) with the
  // correct agent identity. envPassthrough in agents/mcp-servers.json picks
  // this up and forwards it to each child process.
  process.env.AGENT_NAME = config.name;

  // Load the risk-officer system prompt once per run. The body is read from
  // agents/risk-officer.md so operators can tune the rules without touching
  // JS. Falls back to DEFAULT_RISK_OFFICER_SYSTEM_PROMPT if the file is
  // missing or unparseable.
  const riskOfficerPrompt = loadRiskOfficerPrompt();

  console.log(`\n=== Agent: ${config.name} ===`);
  if (config.description) console.log(`Description: ${config.description}`);
  console.log(`Model: ${modelResolution.model} (source: ${modelResolution.source}${modelResolution.envKey ? ` via ${modelResolution.envKey}` : ""})`);
  // Surface the resolved OpenAI endpoint kind so CI logs make it obvious
  // when a model takes the responses-API code path (`gpt-5-codex` and
  // siblings, or any model when `LLM_USE_RESPONSES_API=1` is set). The
  // chat-completions vs responses translation happens inside
  // `chatCompletion`; this is purely diagnostic.
  const endpointKind = useResponsesApiForActiveModel()
    ? "responses"
    : "chat/completions";
  const endpointSource = FORCE_RESPONSES_API
    ? "LLM_USE_RESPONSES_API"
    : modelRequiresResponsesApi(modelResolution.model)
      ? "model"
      : "default";
  console.log(`OpenAI endpoint: ${endpointKind} (source: ${endpointSource})`);
  console.log(`Max turns: ${maxTurns}`);
  console.log(`Dry run: ${DRY_RUN}`);
  console.log(`Confirm writes: ${CONFIRM_WRITES}`);
  console.log(
    `Non-interactive write execute override: ${NON_INTERACTIVE_WRITE_EXECUTE}`
  );
  console.log(`Run network: ${runNetwork}`);
  console.log(`Run log file: ${runLogFile}`);
  console.log(`Tool response budget: ${MAX_TOOL_RESPONSE} chars`);
  console.log(
    `MCP servers: ${config.mcpServers.map((s) => s.name).join(", ") || "(none)"}`
  );
  console.log("");

  const mcpClients = [];
  let agentSummaryText = null;
  let didCreateVault = false;
  let capturedVaultAddress = null;
  const policyRuntime = {
    latestVaultState: null,
    latestOracleAssets: null,
    latestQuotes: null,
    latestMlPicks: null,
    latestQualityPicks: null,
    longNewsBySymbol: new Map(),
    opensExecuted: 0,
    shortOpensExecuted: 0,
    allocationWritesExecuted: 0,
    enforcementRounds: 0,
    // Set to true when create_vault returns an MCP error response (isError:true).
    // Suppresses the get_all_vaults-based address fallback so a failed deployment
    // cannot silently "steal" another agent's vault address. See the 2026-05-21
    // VA-migration regression for the cross-agent contamination this prevents.
    createVaultFailedThisRun: false,
    // Per-run blacklist of yahooSymbols whose `wire_asset` call failed with a
    // structural / non-retryable error (e.g. `INVALID_SYMBOL_POLICY` when
    // Yahoo cannot resolve the symbol). The `needsRoll` directive below
    // strips these from `unwiredPicks` so the LLM stops re-proposing the
    // same impossible wire on every enforcement round (e.g. Atlas surfacing
    // `0R2O.L` for Freeport-McMoRan, which Yahoo Finance does not resolve).
    persistentWireFailures: new Set(),
    // Most recent open-positions roster the LLM has fetched in this run
    // (from list_open_positions or get_perp_capital_snapshot). Consulted by
    // the LLM-driven close path so the post-mortem entry can attach realised
    // PnL without an extra MCP round-trip.
    lastOpenPositionsRoster: null,
    // Most recent get_perp_capital_snapshot payload fetched in this run.
    // Reused by the risk-officer pass when an LLM-driven turn proposes a
    // write batch without first refreshing the snapshot itself.
    lastPerpCapitalSnapshot: null,
    // Pre-LLM market regime snapshot (filled in below before the prompt is
    // built). Used by validatePolicyWriteBatch to deterministically reject
    // new shorts when shortPenalty >= 2.
    marketRegime: null,
    // Risk-officer second-pass audit. `riskOfficerVerdicts` is appended once
    // per reviewed write batch (approve / downsize / veto), and
    // `pendingRiskOfficerVerdict` is the per-batch handoff so
    // `executeToolCall` can stamp each write action with the verdict that
    // approved or rescaled it.
    riskOfficerVerdicts: [],
    pendingRiskOfficerVerdict: null,
  };

  for (const serverDef of config.mcpServers) {
    console.log(`Spawning MCP server: ${serverDef.name}...`);
    const mc = await spawnMcpClient(serverDef);
    mcpClients.push(mc);
    console.log(`  Tools: ${mc.tools.map((t) => t.name).join(", ")}`);
  }
  console.log("");

  const memory = createFileMemoryAdapter({ agentName, networkKey: runNetwork });
  console.log(`Memory: backend=${memory.mode}`);

  // --- Memory: load state and determine vault lifecycle ---
  let state = null;
  let recentRuns = [];
  try {
    const readResult = await memory.readState({ expectedFingerprint: deploymentContext.fingerprint });
    state = readResult.state;
    if (state && readResult.source) {
      console.log(`Memory: state source=${readResult.source}`);
    }
  } catch (err) {
    console.error(`Memory: failed to read state via ${memory.mode} adapter: ${err.message}`);
  }
  try {
    recentRuns = await memory.readRecentRunLog(5);
  } catch (err) {
    console.error(`Memory: failed to read recent run log: ${err.message}`);
    recentRuns = [];
  }

  if (shouldInvalidateDeploymentMemory(state, deploymentContext.fingerprint)) {
    const previousFingerprintLabel = state?.deploymentFingerprint
      ? shortHash(state.deploymentFingerprint)
      : "legacy";
    console.log(
      `Memory: deployment context changed (${previousFingerprintLabel} -> ${shortHash(deploymentContext.fingerprint)}) — invalidating cached vault.`
    );
    if (memory.mode === "file") {
      const rotation = rotateAgentMemoryForDeploymentChange(
        agentName,
        runNetwork,
        state?.deploymentFingerprint || null,
        deploymentContext.fingerprint
      );
      if (rotation.stateArchivePath) {
        console.log(`Memory: archived state -> ${rotation.stateArchivePath}`);
      }
      if (rotation.runLogArchivePath) {
        console.log(`Memory: archived run log -> ${rotation.runLogArchivePath}`);
      }
    }
    state = null;
    recentRuns = [];
  }
  let { needsNewVault, agentFileChanged } = resolveVaultLifecycle(
    state,
    config.fileHash
  );

  const vaultOverride = parseVaultOverride(process.env.AGENT_VAULT_OVERRIDE);
  const vaultOverrideActive = Boolean(vaultOverride);
  if (vaultOverrideActive) {
    console.log(
      `Memory: AGENT_VAULT_OVERRIDE set — targeting ${vaultOverride} for this run only (state/metadata/run-log writes will be skipped).`
    );
    // Reset memory context so the system prompt, policy enforcement, and
    // get_all_vaults guard all operate on the override vault rather than the
    // canonical stored vault for this agent.
    state = {
      vaultAddress: vaultOverride,
      vaultName: config.vaultName || config.name,
    };
    capturedVaultAddress = vaultOverride;
    needsNewVault = false;
    agentFileChanged = false;
    recentRuns = [];
  }

  if (needsNewVault) {
    if (!state) {
      console.log("Memory: no state found — agent will deploy a new vault.");
    } else {
      console.log("Memory: no vault address — agent will deploy a new vault.");
    }
  } else {
    console.log(`Memory: vault ${state.vaultAddress} (${state.vaultName})`);
    if (agentFileChanged) {
      console.log("Memory: agent .md file changed — reusing existing vault.");
    }
    // Seed the runtime tracker from persistent state so policy
    // enforcement, get_all_vaults guards, and other code paths know
    // the active vault from turn 1 (no need to wait for the model to
    // re-discover it via state_get).
    capturedVaultAddress = state.vaultAddress;
  }
  if (recentRuns.length > 0) {
    console.log(
      `Memory: ${recentRuns.length} recent run(s) loaded.`
    );
  }

  const runSummary = {
    agent: config.name,
    model: activeModel,
    modelSource: activeModelSource,
    dryRun: DRY_RUN,
    confirmWrites: CONFIRM_WRITES,
    network: runNetwork,
    turns: 0,
    toolCalls: [],
    writeActions: [],
    confirmationBatches: [],
    // Post-mortems for every position the runner closed this run. Hydrated by
    // `recordClosedPosition` from `(vault, assetId, isLong)` matches against
    // prior open_position calls in this run + recentRuns. Surfaced back into
    // the next run's system prompt by `buildLessonsBlock` so the agent learns
    // from its own wins/losses.
    closedPositions: [],
    errors: [],
    // Soft refusals: MCP tools that returned isError:true but did not
    // submit a tx and ship a `recovery_hint` (e.g. CHURN_GUARD_COOLDOWN,
    // ALREADY_WIRED, INSUFFICIENT_COLLATERAL pre-flight). Tracked
    // separately from `errors[]` so the FAILED-(N) commit subject only
    // reflects hard failures the agent should actually investigate.
    softFailures: [],
    policyDiagnostics: {
      enabled: config.policy?.enabled || false,
      autoAllocateTargetBps: config.policy?.autoAllocateTargetBps || 0,
      entryMode: config.policy?.entryMode || "none",
      entryMomentumPctMin: config.policy?.entryMomentumPctMin || 0,
      entryVolumeMin: config.policy?.entryVolumeMin || 0,
      entryMlScoreMin: config.policy?.entryMlScoreMin || 0,
      entryQualityScoreMin: config.policy?.entryQualityScoreMin || 0,
      entryDirection: config.policy?.entryDirection || "long_only",
      maxNewPositionsPerRun: config.policy?.maxNewPositionsPerRun || 0,
      maxNewShortsPerRun: config.policy?.maxNewShortsPerRun || 0,
      maxTrackedAssets: config.policy?.maxTrackedAssets || 0,
      positionSizingMode: config.policy?.positionSizingMode || "model_decides",
      rebalanceMode: config.policy?.rebalanceMode || "none",
      autoExitMode: config.policy?.autoExitMode || "none",
      eligibleAssetCount: 0,
      eligibleAssetIds: [],
      eligibleSymbols: [],
      allocationRequiredRaw: "0",
      allocationTriggered: false,
      allocationWritesExecuted: 0,
      entryTriggered: false,
      opensExecuted: 0,
      shortOpensExecuted: 0,
      autoExitsClosed: 0,
      autoExitsAttempted: 0,
    },
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };

  try {
    const toolNameCount = {};
    for (const mc of mcpClients) {
      for (const t of mc.tools) {
        toolNameCount[t.name] = (toolNameCount[t.name] || 0) + 1;
      }
    }

    const toolMap = new Map();
    for (const mc of mcpClients) {
      for (const t of mc.tools) {
        const key =
          toolNameCount[t.name] > 1 ? `${mc.serverName}/${t.name}` : t.name;
        toolMap.set(key, { client: mc.client, tool: { ...t, name: key } });
      }
    }

    const allTools = [...toolMap.values()].map((v) => v.tool);
    const openaiTools = mcpToolsToOpenAI(allTools);

    // Pre-LLM market-regime fetch. Pinned into the system prompt so the
    // model doesn't have to remember to call it AND so the runner's short-
    // side gate (validatePolicyWriteBatch) can reject shorts deterministically
    // when shortPenalty >= 2. Best-effort: a Yahoo blip just leaves the
    // prompt without the regime block; the runner gate then no-ops.
    let marketRegime = null;
    const regimeEntry = toolMap.get("get_market_regime");
    if (regimeEntry) {
      try {
        const res = await regimeEntry.client.callTool({
          name: "get_market_regime",
          arguments: {},
        });
        const content = res.content
          .map((c) => (c.type === "text" ? c.text : JSON.stringify(c)))
          .join("\n");
        const parsed = parseJsonText(content);
        if (parsed && typeof parsed === "object") {
          marketRegime = parsed;
          policyRuntime.marketRegime = parsed;
          console.log(
            `[REGIME] ${parsed.summary || `regime=${parsed.regime} shortPenalty=${parsed.shortPenalty}`}`,
          );
        }
      } catch (err) {
        const safeErr = redactSecrets(err?.message || String(err));
        console.warn(`[REGIME] get_market_regime fetch failed: ${safeErr}`);
      }
    }

    const systemPrompt = buildSystemPrompt(
      config,
      state,
      recentRuns,
      needsNewVault,
      marketRegime,
    );

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: config.userPrompt },
    ];

    async function executeToolCall(call, { forceSkipWrites = false } = {}) {
      const { toolCall, toolName, originalName, args, isWrite } = call;

      // Pin the `vault` arg on write tools to the agent's canonical vault.
      // We only override when (a) the agent has exactly one bound vault in
      // memory, (b) the tool actually takes a vault parameter, and (c) the
      // LLM-provided value differs case-insensitively from the canonical one.
      const pin = applyVaultArgPin({
        toolName: originalName,
        args,
        canonicalVault: capturedVaultAddress,
      });
      if (pin.overridden) {
        console.log(
          `  [POLICY] Overrode hallucinated vault arg ${pin.suppliedVault || "(missing)"} -> ${pin.canonicalVault} on ${originalName}.`,
        );
        if (!Array.isArray(runSummary.policyDiagnostics.vaultPinOverrides)) {
          runSummary.policyDiagnostics.vaultPinOverrides = [];
        }
        runSummary.policyDiagnostics.vaultPinOverrides.push({
          tool: originalName,
          suppliedVault: pin.suppliedVault || null,
          canonicalVault: pin.canonicalVault,
        });
      }

      console.log(`  Tool: ${toolName}(${JSON.stringify(args)})`);
      runSummary.toolCalls.push(toolName);

      if (originalName === "get_all_vaults" && capturedVaultAddress) {
        const skipMsg =
          `[POLICY] Skipped get_all_vaults because this agent already has its vault in memory: ${capturedVaultAddress}`;
        console.log(`  ${skipMsg}`);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: skipMsg,
        });
        return;
      }

      // Cheap pre-execution guard: short-circuit `set_vault_assets` calls
      // whose proposed assetIds set already matches the on-chain tracked
      // set. Without this guard the mining-manager / quality-matrix-manager
      // could burn 6+ redundant on-chain writes per run (one per policy
      // enforcement round) when the tracked list was already correct but
      // `eligibleAssets` was empty for unrelated reasons (e.g. the LLM
      // called `get_oracle_assets({ compact: true })`, see
      // normalizeOracleAssets above). Returning a synthetic success keeps
      // the LLM moving forward without a turn-burning revise loop.
      if (
        originalName === "set_vault_assets" &&
        Array.isArray(args?.assetIds) &&
        Array.isArray(policyRuntime.latestVaultState?.assets)
      ) {
        const proposed = new Set(
          args.assetIds.map((a) => String(a || "").toLowerCase()).filter(Boolean),
        );
        const current = new Set(
          policyRuntime.latestVaultState.assets
            .map((a) => String(a || "").toLowerCase())
            .filter(Boolean),
        );
        const sameSet =
          proposed.size === current.size &&
          [...proposed].every((id) => current.has(id));
        if (sameSet && proposed.size > 0) {
          const skipMsg =
            `[POLICY] Skipped set_vault_assets: proposed asset set (${proposed.size} ids) already matches on-chain tracked set; no transaction needed.`;
          console.log(`  ${skipMsg}`);
          runSummary.writeActions.push({
            tool: toolName,
            args,
            skipped: true,
            skipReason: "NO_CHANGE",
            justification: args.justification || null,
            timestamp: new Date().toISOString(),
          });
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              success: true,
              skipped: "NO_CHANGE",
              message:
                "Proposed assetIds already match the on-chain tracked set; no write performed. Proceed to the next step (allocate / open / close) without re-issuing set_vault_assets.",
            }),
          });
          return;
        }
      }

      const entry = toolMap.get(toolName);
      if (!entry) {
        const errMsg = `Unknown tool: ${toolName}`;
        console.error(`  ${errMsg}`);
        runSummary.errors.push({ tool: toolName, error: errMsg });
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: errMsg,
        });
        return;
      }

      if ((DRY_RUN || forceSkipWrites) && isWrite) {
        const skipMsg = DRY_RUN
          ? `[DRY RUN] Skipped write tool: ${toolName}`
          : `[CONFIRM WRITES] Non-interactive session without AGENT_NON_INTERACTIVE_WRITE_EXECUTE=1; skipped write tool: ${toolName}`;
        console.log(`  ${skipMsg}`);
        runSummary.writeActions.push({
          tool: toolName,
          args,
          skipped: true,
          justification: args.justification || null,
          timestamp: new Date().toISOString(),
        });
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: skipMsg,
        });
        return;
      }

      try {
        const result = await entry.client.callTool({
          name: originalName,
          arguments: args,
        });
        // SECURITY: redact secrets (e.g. keeper private key from a leaked
        // `cast send` error) before this content flows into stdout, the
        // OpenAI messages array, or downstream parsers.
        const content = redactSecrets(
          result.content
            .map((c) => (c.type === "text" ? c.text : JSON.stringify(c)))
            .join("\n"),
        );

        const preview =
          content.slice(0, 200) + (content.length > 200 ? "..." : "");
        console.log(`  Result: ${preview}`);

        // MCP servers signal tool-call failures via `result.isError === true`
        // (see vault-manager toolError / writeError helpers). Without this
        // branch the runner would (a) record a writeAction for a reverted tx
        // as if it had succeeded, and (b) — for create_vault specifically —
        // fall through to the get_all_vaults fallback below and capture a
        // sibling agent's vault address.
        const isMcpError = recordMcpErrorIfPresent({
          result,
          content,
          runSummary,
          policyRuntime,
          toolName,
          originalName,
        });
        if (isMcpError) {
          console.error(`  [MCP ERROR] ${toolName} returned isError:true — ${content.slice(0, 500)}`);
          if (originalName === "create_vault") {
            console.error(
              `  [MCP ERROR] create_vault failed; suppressing get_all_vaults-based address capture for this run.`,
            );
          }
        }

        if (isWrite) {
          const writeAction = {
            tool: toolName,
            args,
            skipped: false,
            failed: isMcpError || undefined,
            justification: args.justification || null,
            timestamp: new Date().toISOString(),
          };
          const pendingRO = policyRuntime.pendingRiskOfficerVerdict;
          if (pendingRO) {
            writeAction.riskOfficer = {
              verdict: pendingRO.verdict,
              reason: pendingRO.reason || null,
              ...(pendingRO.verdict === "downsize"
                ? { downsizeFactor: pendingRO.downsizeFactor }
                : {}),
            };
            // Surface the per-call downsize record (before / after) so the
            // UI can render "Risk officer downsized 50%: ..." next to the
            // tx hash without re-deriving the math.
            if (pendingRO.verdict === "downsize" && Array.isArray(pendingRO.audit)) {
              const perCall = pendingRO.audit.find(
                (a) =>
                  String(a.assetId || "").toLowerCase() === String(args.assetId || "").toLowerCase(),
              );
              if (perCall) writeAction.riskOfficer.downsize = perCall;
            }
          }
          runSummary.writeActions.push(writeAction);
        }

        const parsed = parseJsonText(content);
        if (isWrite && parsed?.transactionHash) {
          const lastAction = runSummary.writeActions[runSummary.writeActions.length - 1];
          if (lastAction) lastAction.txHash = parsed.transactionHash;
        }
        if (originalName === "get_vault_state" && parsed && typeof parsed === "object") {
          policyRuntime.latestVaultState = parsed;
        }
        if (originalName === "get_oracle_assets" && parsed && typeof parsed === "object") {
          policyRuntime.latestOracleAssets = parsed;
        }
        if (originalName === "yfinance_quote" && Array.isArray(parsed)) {
          policyRuntime.latestQuotes = parsed;
        }
        // Cache the most recent open-positions roster so the LLM-driven
        // close path can attach realised PnL to its post-mortem entry
        // without burning an extra MCP read. Both tools return the same
        // per-leg fields (unrealisedPnlUsdc, unrealisedPnlPctOfCollateral)
        // from `buildOpenPositionsRoster` in apps/mcps/vault-manager.
        if (
          (originalName === "list_open_positions" || originalName === "get_perp_capital_snapshot") &&
          parsed &&
          typeof parsed === "object"
        ) {
          const positions = Array.isArray(parsed.positions)
            ? parsed.positions
            : Array.isArray(parsed.openPositions)
              ? parsed.openPositions
              : null;
          if (positions) {
            policyRuntime.lastOpenPositionsRoster = {
              fetchedAt: new Date().toISOString(),
              positions,
            };
          }
          if (originalName === "get_perp_capital_snapshot") {
            policyRuntime.lastPerpCapitalSnapshot = parsed;
          }
        }
        if (
          originalName === "get_ml_top_picks" &&
          parsed &&
          Array.isArray(parsed.picks)
        ) {
          policyRuntime.latestMlPicks = parsed.picks;
        }
        if (
          originalName === "get_ml_basket" &&
          parsed &&
          Array.isArray(parsed.companies) &&
          !policyRuntime.latestMlPicks
        ) {
          policyRuntime.latestMlPicks = parsed.companies;
        }
        if (
          (originalName === "get_quality_top_picks" ||
            originalName === "get_quality_trade_ready_picks") &&
          parsed &&
          Array.isArray(parsed.picks)
        ) {
          policyRuntime.latestQualityPicks = parsed.picks;
        }
        if (originalName === "yfinance_news" && parsed && Array.isArray(parsed)) {
          for (const row of parsed) {
            const sym = String(row?.symbol || "").toUpperCase();
            if (!sym) continue;
            const { qualifies, bestHeadline, sentiment } = pickQualifyingLongHeadline(
              row.headlines,
              {
                maxAgeDays: config.policy?.entryLongNewsMaxAgeDays ?? 90,
              },
            );
            policyRuntime.longNewsBySymbol.set(sym, {
              qualifies,
              sentiment,
              headline: bestHeadline?.title ?? null,
              publishedAt: bestHeadline?.publishedAt ?? null,
            });
          }
        }
        if (originalName === "allocate_to_perp" && parsed?.success === true) {
          policyRuntime.allocationWritesExecuted += 1;
        }
        if (originalName === "open_position" && parsed?.success === true) {
          policyRuntime.opensExecuted += 1;
          if (call.args?.isLong === false) {
            policyRuntime.shortOpensExecuted += 1;
          }
          const vaultArg = args?.vault || capturedVaultAddress;
          const assetIdArg = args?.assetId;
          const isLongArg = typeof args?.isLong === "boolean" ? args.isLong : true;
          if (vaultArg && assetIdArg && isLongArg === true) {
            try {
              recordRecentlyOpened({
                vault: vaultArg,
                assetId: assetIdArg,
                isLong: true,
                ticker: lookupSymbolForAssetId(assetIdArg),
                projectRoot: PROJECT_ROOT,
              });
            } catch {
              // non-fatal
            }
          }
        }
        // LLM-driven closes also feed the churn-guard. The reason string is
        // free-form so the agent's `justification` is the audit trail; we
        // tag the entry as `llm_judged` so plan_open_position's response
        // makes it clear this wasn't an auto-exit.
        if (originalName === "close_position" && parsed?.success === true) {
          const vaultArg = args?.vault || capturedVaultAddress;
          const assetIdArg = args?.assetId;
          const isLongArg = typeof args?.isLong === "boolean" ? args.isLong : null;
          const justificationArg = args?.justification ? String(args.justification).slice(0, 200) : null;
          const tickerHint = lookupSymbolForAssetId(assetIdArg);
          recordCloseInChurnGuard({
            vault: vaultArg,
            assetId: assetIdArg,
            isLong: isLongArg,
            ticker: tickerHint,
            reason: justificationArg
              ? `llm_judged: ${justificationArg}`
              : "llm_judged",
          });
          // Post-mortem: realised PnL is not in the close_position tool
          // response, so we fall back to the most recent open-position roster
          // we observed this run (from list_open_positions or
          // get_perp_capital_snapshot). When unavailable the entry still
          // captures the entry/exit justifications + hold time, which is
          // useful even without a PnL ranking.
          let pnlUsdc = null;
          let pnlPct = null;
          if (vaultArg && assetIdArg && isLongArg !== null) {
            const cached = policyRuntime.lastOpenPositionsRoster?.positions;
            if (Array.isArray(cached)) {
              const match = cached.find(
                (p) =>
                  String(p?.assetId || "").toLowerCase() === String(assetIdArg).toLowerCase() &&
                  p?.isLong === isLongArg,
              );
              if (match) {
                pnlUsdc = match.unrealisedPnlUsdc ?? null;
                if (Number.isFinite(match.unrealisedPnlPctOfCollateral)) {
                  pnlPct = Number(match.unrealisedPnlPctOfCollateral);
                }
              }
            }
          }
          recordClosedPosition({
            vault: vaultArg,
            assetId: assetIdArg,
            isLong: isLongArg,
            ticker: tickerHint,
            closedReason: justificationArg
              ? `llm_judged: ${justificationArg}`
              : "llm_judged",
            closeJustification: justificationArg,
            realizedPnlUsdc: pnlUsdc,
            realizedPnlPctOfCollateral: pnlPct,
          });
        }

        // Track structurally-bad `wire_asset` failures so the `needsRoll`
        // enforcement directive stops listing them as "unwired picks to
        // wire" on every retry. `INVALID_SYMBOL_POLICY` means Yahoo Finance
        // could not resolve the symbol at all (e.g. Atlas's `0R2O.L` for
        // Freeport-McMoRan), and retrying within the same run cannot
        // possibly succeed.
        if (
          originalName === "wire_asset" &&
          isMcpError &&
          parsed?.error_code === "INVALID_SYMBOL_POLICY"
        ) {
          const failedSymbol = String(args?.symbol || parsed?.requestedSymbol || "")
            .toUpperCase();
          if (failedSymbol) {
            policyRuntime.persistentWireFailures.add(failedSymbol);
            console.log(
              `  [POLICY] Blacklisted ${failedSymbol} for this run (wire_asset INVALID_SYMBOL_POLICY).`,
            );
          }
        }

        // --- Vault address capture ---
        if (originalName === "create_vault") {
          didCreateVault = true;
          const addrFromCreate = extractVaultAddressFromCreateVaultResponse(content);
          if (addrFromCreate) {
            capturedVaultAddress = addrFromCreate;
            console.log(`  >> Captured new vault address from create_vault: ${addrFromCreate}`);
          }
        }
        if (
          originalName === "get_all_vaults" &&
          didCreateVault &&
          !capturedVaultAddress &&
          !policyRuntime.createVaultFailedThisRun
        ) {
          // Only capture when we can match the agent's expected vault name
          // exactly. The previous "newest entry" fallback is gone — see
          // extractNewestVaultAddress doc-comment for the contamination
          // incident that motivated this.
          const addr = extractNewestVaultAddress(content, config.vaultName);
          if (addr) {
            capturedVaultAddress = addr;
            console.log(`  >> Captured new vault address: ${addr}`);
          } else {
            console.warn(
              `  >> get_all_vaults did not contain a vault named "${config.vaultName ?? "(unknown)"}"; leaving vault address unset.`,
            );
          }
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: truncateForLLM(content),
        });
      } catch (err) {
        const safeErrMessage = redactSecrets(err.message || String(err));
        const errMsg = `Tool error: ${safeErrMessage}`;
        console.error(`  ${errMsg}`);
        runSummary.errors.push({ tool: toolName, error: safeErrMessage });
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: errMsg,
        });
      }
    }

    // -----------------------------------------------------------------------
    // Pre-LLM auto-rebalance pass
    //
    // Runs deterministically before the LLM loop when the active policy is
    // `rebalanceMode: track_top_n` and there's already a vault. We fetch the
    // latest Atlas ML top-N picks and close any open position whose underlying
    // asset has dropped out of the eligible set. The LLM still owns PnL-based
    // TP/SL (the system prompt instructs that), so this pass only handles the
    // "track-top-N" half — keeping the math out of JS.
    // -----------------------------------------------------------------------
    async function runMcpTool(toolName, args, { isWrite = false, justification } = {}) {
      const entry = toolMap.get(toolName);
      if (!entry) {
        throw new Error(`Auto-rebalance: tool not available in this run: ${toolName}`);
      }
      const writeJustification = justification ?? "auto-rebalance";
      if ((DRY_RUN || (CONFIRM_WRITES && !NON_INTERACTIVE_WRITE_EXECUTE && !isInteractiveTty())) && isWrite) {
        console.log(`  [AUTO-REBALANCE] Skipped write tool ${toolName} (dry/non-interactive).`);
        runSummary.writeActions.push({
          tool: toolName,
          args,
          skipped: true,
          justification: `${writeJustification} (skipped due to dry/non-interactive)`,
          timestamp: new Date().toISOString(),
        });
        return { content: [{ type: "text", text: JSON.stringify({ success: false, skipped: true }, null, 2) }] };
      }
      const result = await entry.client.callTool({ name: toolName, arguments: args });
      const content = redactSecrets(
        result.content
          .map((c) => (c.type === "text" ? c.text : JSON.stringify(c)))
          .join("\n"),
      );
      if (isWrite) {
        const parsed = parseJsonText(content);
        runSummary.writeActions.push({
          tool: toolName,
          args,
          skipped: false,
          justification: writeJustification,
          txHash: parsed?.transactionHash ?? null,
          timestamp: new Date().toISOString(),
        });
      }
      return { content, parsed: parseJsonText(content) };
    }

    // Issue a single deterministic close as part of the auto-rebalance pass.
    // Centralised so the dropout / rank-swap / pnl-band branches share the
    // same logging + counter book-keeping.
    async function autoRebalanceClose({ pos, reason, label = "AUTO-REBALANCE" }) {
      console.log(
        `[${label}] Closing ${pos.symbol || pos.assetId} (isLong=${pos.isLong}): ${reason}`,
      );
      try {
        const closeRes = await runMcpTool(
          "close_position",
          {
            vault: capturedVaultAddress,
            assetId: pos.assetId,
            isLong: pos.isLong,
            sizeDelta: String(pos.size),
            collateralDelta: String(pos.collateral),
            justification: `${label.toLowerCase()}: ${reason}`,
          },
          { isWrite: true, justification: `${label.toLowerCase()}: ${reason}` },
        );
        if (closeRes.parsed?.success === true) {
          runSummary.policyDiagnostics.autoExitsClosed += 1;
          // Churn-guard: record so plan_open_position blocks re-opens of
          // the rotated/banded ticker for CHURN_GUARD_WINDOW_MS.
          recordCloseInChurnGuard({
            vault: capturedVaultAddress,
            assetId: pos.assetId,
            isLong: pos.isLong,
            ticker: pos.symbol || null,
            reason: `${label.toLowerCase()}: ${reason}`,
          });
          // Post-mortem: realised PnL at close ≈ unrealised PnL at the
          // moment of the close call (the position was marked-to-market
          // against the same oracle price that settles the on-chain close
          // — see VaultAccounting.closePosition / GMX vault settlement).
          // `pos` was built by buildOpenPositionsRoster (`list_open_positions`
          // or `get_perp_capital_snapshot`) which attaches both fields.
          recordClosedPosition({
            vault: capturedVaultAddress,
            assetId: pos.assetId,
            isLong: pos.isLong,
            ticker: pos.symbol || null,
            closedReason: `${label.toLowerCase()}: ${reason}`,
            closeJustification: `${label.toLowerCase()}: ${reason}`,
            realizedPnlUsdc: pos.unrealisedPnlUsdc ?? null,
            realizedPnlPctOfCollateral:
              Number.isFinite(pos.unrealisedPnlPctOfCollateral)
                ? Number(pos.unrealisedPnlPctOfCollateral)
                : null,
          });
          return true;
        }
      } catch (err) {
        const safeErr = redactSecrets(err.message || String(err));
        console.error(`[${label}] close_position failed for ${pos.symbol || pos.assetId}: ${safeErr}`);
        runSummary.errors.push({ tool: "close_position", error: safeErr });
      }
      return false;
    }

    // Build context + dispatch one risk-officer pass for a proposed write
    // batch. The LLM call uses a single-message system+user prompt with
    // temperature 0 (deterministic verdicts) and a small max_tokens budget
    // so the per-tick cost is bounded.
    async function runRiskOfficerForBatch(writeCalls) {
      const recentClosedPositions = [
        ...(runSummary.closedPositions || []),
        // Then walk recentRuns (newest last) and pull their closures.
        ...recentRuns
          .flatMap((r) => (Array.isArray(r?.closedPositions) ? r.closedPositions : []))
          .slice(-10),
      ].slice(-5);

      let vaultSnapshot = policyRuntime.lastPerpCapitalSnapshot || null;
      // Best-effort fresh snapshot. If we can't read it, fall back to the
      // last cached one; if neither exists we still run the pass — the LLM
      // is told the snapshot is null and decides accordingly.
      if (!vaultSnapshot && capturedVaultAddress) {
        try {
          const snapshotRes = await runMcpTool("get_perp_capital_snapshot", {
            vault: capturedVaultAddress,
          });
          if (snapshotRes?.parsed && typeof snapshotRes.parsed === "object") {
            vaultSnapshot = snapshotRes.parsed;
            policyRuntime.lastPerpCapitalSnapshot = snapshotRes.parsed;
          }
        } catch (err) {
          const safeErr = redactSecrets(err?.message || String(err));
          console.warn(`[RISK-OFFICER] snapshot fetch failed: ${safeErr}`);
        }
      }

      const verdict = await runRiskOfficerPass({
        writeBatch: writeCalls,
        vaultSnapshot,
        recentClosedPositions,
        marketRegime: policyRuntime.marketRegime,
        systemPrompt: riskOfficerPrompt,
        async llmCall(system, user) {
          const resp = await chatCompletion(
            [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            undefined, // no tool definitions — the risk officer only emits text
            0,
          );
          const choice = resp?.choices?.[0];
          return choice?.message?.content || "";
        },
      });
      return verdict;
    }

    // Append a post-mortem entry to `runSummary.closedPositions` so the
    // run-log (and the next run's "## Lessons" block) can connect each
    // close back to the matching open and surface realised PnL. Best-effort:
    // a duplicate close on the same `(vault, assetId, isLong)` within a
    // single run is collapsed into the first entry so the log stays clean.
    function recordClosedPosition({
      vault,
      assetId,
      isLong,
      ticker,
      closedReason,
      closeJustification,
      realizedPnlUsdc,
      realizedPnlPctOfCollateral,
    }) {
      if (!vault || !assetId || typeof isLong !== "boolean") return;
      const closedAt = new Date().toISOString();
      const matchingOpen = findMatchingOpen({
        vault,
        assetId,
        isLong,
        currentRunActions: runSummary.writeActions || [],
        recentRuns,
      });
      const entry = buildClosedPositionEntry({
        vault,
        assetId,
        isLong,
        ticker,
        closedAt,
        closedReason,
        closeJustification,
        realizedPnlUsdc,
        realizedPnlPctOfCollateral,
        matchingOpen,
      });
      // Collapse duplicates within a single run (e.g. an LLM close fired
      // after the auto-rebalance pass already closed the same leg).
      const dupIdx = runSummary.closedPositions.findIndex(
        (c) => c.vault === entry.vault && c.assetId === entry.assetId && c.side === entry.side,
      );
      if (dupIdx >= 0) {
        // Keep the first record (autopilot path) but augment it with any
        // realised PnL the second path observed if the first missed it.
        const existing = runSummary.closedPositions[dupIdx];
        if (existing.realizedPnlPctOfCollateral == null && entry.realizedPnlPctOfCollateral != null) {
          existing.realizedPnlPctOfCollateral = entry.realizedPnlPctOfCollateral;
          existing.realizedPnlUsdc = entry.realizedPnlUsdc;
        }
        return;
      }
      runSummary.closedPositions.push(entry);
    }

    // Best-effort write into agents/memory/shared/recently-closed.<vault>.json
    // so plan_open_position can refuse churn re-opens. Never blocks; a write
    // failure is logged to stderr and dropped.
    function recordCloseInChurnGuard({ vault, assetId, isLong, ticker, reason }) {
      if (!vault || !assetId) return;
      try {
        recordRecentlyClosed({
          vault,
          assetId,
          ticker: ticker || null,
          isLong: typeof isLong === "boolean" ? isLong : null,
          closedReason: reason || null,
          projectRoot: PROJECT_ROOT,
        });
      } catch (err) {
        const safeErr = redactSecrets(err?.message || String(err));
        console.error(
          `[CHURN-GUARD] failed to record close for ${assetId}: ${safeErr}`,
        );
      }
    }

    // Reverse lookup symbol from assetId using the most recent oracle reads.
    // Used by the LLM-driven close path where we only know the bytes32 id.
    function lookupSymbolForAssetId(assetId) {
      if (!assetId) return null;
      const key = String(assetId).toLowerCase();
      const oracle = policyRuntime.latestOracleAssets;
      if (!oracle) return null;
      const summary = oracle.summary && typeof oracle.summary === "object" ? oracle.summary : null;
      if (summary?.symbolToAssetId && typeof summary.symbolToAssetId === "object") {
        for (const [sym, id] of Object.entries(summary.symbolToAssetId)) {
          if (String(id).toLowerCase() === key) return sym;
        }
      }
      const assets = Array.isArray(oracle.assets) ? oracle.assets : null;
      if (assets) {
        for (const asset of assets) {
          if (String(asset?.assetId || "").toLowerCase() === key) {
            return asset?.symbol || null;
          }
        }
      }
      return null;
    }

    async function enforceAutoRebalance() {
      const policy = config.policy;
      if (
        !policy?.enabled ||
        policy.rebalanceMode !== "track_top_n" ||
        !["ml_score", "quality_score"].includes(policy.entryMode) ||
        !capturedVaultAddress
      ) {
        return;
      }

      try {
        const vault = capturedVaultAddress;
        console.log(`[AUTO-REBALANCE] Checking open positions for ${vault}...`);
        const positionsRes = await runMcpTool("list_open_positions", { vault });
        let positionsParsed = positionsRes.parsed;
        let positions = Array.isArray(positionsParsed?.positions) ? positionsParsed.positions : [];

        const isQuality = policy.entryMode === "quality_score";
        const minScore = Number(
          isQuality ? policy.entryQualityScoreMin ?? 0 : policy.entryMlScoreMin ?? 0,
        );
        const cap = Math.max(0, Number(policy.maxTrackedAssets ?? 0)) || 10;
        const picksToolName = isQuality
          ? "get_quality_trade_ready_picks"
          : "get_ml_top_picks";
        const picksArgs = isQuality
          ? {
              limit: cap,
              minCompositeScore: minScore,
              minTradeReadinessScore: minScore,
              entryMaxSignalAgeDays: policy.entryMaxSignalAgeDays,
              entryMaxRecent5dReturnPct: policy.entryMaxRecent5dReturnPct,
              entryMaxRecent20dReturnPct: policy.entryMaxRecent20dReturnPct,
              entryRecencyHalfLifeDays: policy.entryRecencyHalfLifeDays,
            }
          : { limit: cap, minScore };
        const picksRes = await runMcpTool(picksToolName, picksArgs);
        const picksParsed = picksRes.parsed;
        const picks = Array.isArray(picksParsed?.picks) ? picksParsed.picks : [];

        const eligibleSymbols = new Set(
          picks
            .map((p) => String(p.yahooSymbol || "").toUpperCase())
            .filter(Boolean),
        );

        // Pass 1: dropouts from the top-N (existing behaviour). Wrap legacy
        // closures with `signalLabel` so the auto-exit log keeps reading the
        // same way.
        const dropoutClosures = computeAutoRebalanceClosures({
          policy,
          positions,
          eligibleSymbols,
          minScore,
          cap,
          signalLabel: isQuality ? "Quality top" : "ML top",
        });

        // Pass 2: PnL-band TP/SL (opt-in via autoExitMode includes pnl_band).
        const pnlBandClosures = computePnlBandClosures({ policy, positions });

        // Run dropout + pnl-band closures first so the rank-swap pass below
        // sees the up-to-date roster and `availableCollateral`.
        let combined = [...dropoutClosures];
        for (const c of pnlBandClosures) {
          if (!combined.some((existing) => existing.pos.positionKey === c.pos.positionKey)) {
            combined.push(c);
          }
        }

        runSummary.policyDiagnostics.autoExitsAttempted = combined.length;

        let executedAny = false;
        if (combined.length === 0 && positions.length > 0) {
          const label = isQuality ? `Quality top-${cap}` : `ML top-${cap}`;
          console.log(
            `[AUTO-REBALANCE] All ${positions.length} open positions remain in ${label} and within PnL band; checking rank-swap.`,
          );
        }
        for (const closure of combined) {
          const ok = await autoRebalanceClose({ pos: closure.pos, reason: closure.reason });
          if (ok) executedAny = true;
        }

        // Pass 3: rank-swap rotation (opt-in via autoExitMode includes
        // rank_swap). Re-read the roster + perp capital after any prior
        // closures so we don't over-rotate.
        const autoExitMode = String(policy.autoExitMode || "none");
        if (!autoExitMode.includes("rank_swap")) {
          return;
        }

        let snapshotRes;
        try {
          snapshotRes = await runMcpTool("get_perp_capital_snapshot", { vault });
        } catch (err) {
          const safeErr = redactSecrets(err.message || String(err));
          console.error(`[AUTO-REBALANCE] rank-swap skipped (snapshot read failed): ${safeErr}`);
          runSummary.errors.push({ tool: "_auto_rebalance_snapshot", error: safeErr });
          return;
        }
        const snapshotParsed = snapshotRes?.parsed;
        const refreshedPositions = Array.isArray(snapshotParsed?.openPositions)
          ? snapshotParsed.openPositions
          : positions;
        const availableCollateralUsdc =
          snapshotParsed?.accounting?.availableCollateral ?? "0";
        const depositedCapitalUsdc =
          snapshotParsed?.accounting?.depositedCapital ?? "0";

        // Estimate per-slot collateral as the equal-weight share of the
        // perp capital across the full tracked basket. Conservative: this
        // is the slot the agent *should* deploy under `positionSizingMode:
        // equal_weight`, so dividing total capital by `maxTrackedAssets`
        // matches the steady-state allocation the runner is targeting.
        let minSlotCollateralUsdc = "0";
        try {
          const totalBn = BigInt(String(depositedCapitalUsdc || "0"));
          const slots = Math.max(1, Number(policy.maxTrackedAssets || 0) || 1);
          minSlotCollateralUsdc = (totalBn / BigInt(slots)).toString();
        } catch {
          minSlotCollateralUsdc = "0";
        }

        const rankSwapClosures = computeRankSwapClosures({
          policy,
          positions: refreshedPositions,
          rankedPicks: picks,
          availableCollateralUsdc,
          minSlotCollateralUsdc,
          positionOpenAgeMs: (pos) =>
            getPositionOpenAgeMs({
              vault,
              assetId: pos?.assetId,
              isLong: pos?.isLong !== false,
              projectRoot: PROJECT_ROOT,
            }),
        });
        if (rankSwapClosures.length === 0) {
          if (!executedAny) {
            console.log(
              `[AUTO-REBALANCE] Rank-swap: no rotation needed (available ${availableCollateralUsdc} >= slot ${minSlotCollateralUsdc} for ${rankSwapClosures.length} wanted picks).`,
            );
          }
          return;
        }
        runSummary.policyDiagnostics.autoExitsAttempted += rankSwapClosures.length;
        for (const closure of rankSwapClosures) {
          await autoRebalanceClose({ pos: closure.pos, reason: closure.reason });
        }
      } catch (err) {
        const safeErr = redactSecrets(err.message || String(err));
        console.error(`[AUTO-REBALANCE] aborted: ${safeErr}`);
        runSummary.errors.push({ tool: "_auto_rebalance", error: safeErr });
      }
    }

    // -----------------------------------------------------------------------
    // Startup vault-identity guardrail
    //
    // Belt-and-braces companion to the create_vault contamination fix in
    // commit 00cfb07. Even with the get_all_vaults fallback closed, a stale
    // state.json, manual edit, or bad CI restore could still pin an agent to
    // a sibling's vault. Before the LLM (or the deterministic auto-rebalance
    // pass) is allowed to issue ANY write against `capturedVaultAddress`, we
    // call get_vault_state and compare the on-chain `name()` to
    // `config.vaultName`. On mismatch we throw — the existing top-level
    // catch in runAgent persists the failure to run-log so CI gets a
    // structured artifact and the operator can clear the state file.
    // -----------------------------------------------------------------------
    async function verifyVaultIdentity() {
      if (needsNewVault || !capturedVaultAddress) {
        return; // No vault yet; deployment is the LLM's job this run.
      }
      if (!config.vaultName) {
        console.log(
          "[VAULT IDENTITY] Skipped: agent has no `vaultName` configured (legacy agent).",
        );
        return;
      }

      let onChainName = null;
      try {
        const res = await runMcpTool("get_vault_state", { vault: capturedVaultAddress });
        onChainName = typeof res.parsed?.name === "string" ? res.parsed.name : null;
      } catch (err) {
        const safeErr = redactSecrets(err.message || String(err));
        const wrapped = new Error(
          `[VAULT IDENTITY] get_vault_state failed for ${capturedVaultAddress} — refusing to run against an unverifiable vault: ${safeErr}`,
        );
        runSummary.errors.push({ tool: "_vault_identity", error: wrapped.message });
        throw wrapped;
      }

      const verdict = verifyVaultNameMatch({
        onChainName,
        expectedName: config.vaultName,
        vaultAddress: capturedVaultAddress,
        agentName: config.name,
      });

      if (verdict.ok) {
        if (verdict.skipped) return;
        console.log(
          `[VAULT IDENTITY] OK: ${capturedVaultAddress} on-chain name = "${onChainName}"`,
        );
        return;
      }

      if (vaultOverrideActive) {
        // Override is operator-driven; honour it but warn loudly so the
        // operator notices when they've targeted a vault of the wrong type.
        console.warn(verdict.error);
        console.warn(
          "[VAULT IDENTITY] AGENT_VAULT_OVERRIDE is active — proceeding despite name mismatch (operator-driven).",
        );
        runSummary.errors.push({
          tool: "_vault_identity",
          error: `${verdict.reason}: override-bypassed`,
        });
        return;
      }

      runSummary.errors.push({ tool: "_vault_identity", error: verdict.error });
      throw new Error(verdict.error);
    }

    await verifyVaultIdentity();

    if (config.policy?.rebalanceMode === "track_top_n" && !needsNewVault) {
      await enforceAutoRebalance();
    }

    if (config.policy?.entryRequireLongNews) {
      const union = readNewsCacheUnion({ projectRoot: PROJECT_ROOT });
      for (const [sym, entry] of union.entries()) {
        const { qualifies, bestHeadline, sentiment } = pickQualifyingLongHeadline(
          entry.headlines,
          { maxAgeDays: config.policy.entryLongNewsMaxAgeDays ?? 90 },
        );
        policyRuntime.longNewsBySymbol.set(sym, {
          qualifies,
          sentiment,
          headline: bestHeadline?.title ?? null,
          publishedAt: bestHeadline?.publishedAt ?? null,
          fromCache: true,
        });
      }
    }

    for (let turn = 0; turn < maxTurns; turn++) {
      runSummary.turns = turn + 1;
      console.log(`--- Turn ${turn + 1}/${maxTurns} ---`);

      const llmStats = { retryCount: 0, retryWaitMs: 0 };
      const llmStartedAt = Date.now();
      const response = await chatCompletion(
        messages,
        openaiTools,
        config.temperature,
        llmStats
      );
      const llmElapsedMs = Date.now() - llmStartedAt;
      const llmElapsedFmt = (llmElapsedMs / 1000).toFixed(1);
      if (llmStats.retryCount > 0) {
        const waitFmt = (llmStats.retryWaitMs / 1000).toFixed(1);
        const retryWord = llmStats.retryCount === 1 ? "retry" : "retries";
        console.log(
          `  LLM call: ${llmElapsedFmt}s (${llmStats.retryCount} ${retryWord}, ${waitFmt}s waiting — retries do not consume turn budget)`
        );
      } else {
        console.log(`  LLM call: ${llmElapsedFmt}s`);
      }
      let choice = response.choices[0];
      let classified = classifyToolCalls(
        choice.message.tool_calls || [],
        config.writeTools
      );
      let skipWritesThisBatch = false;
      const policyEnabled = config.policy?.enabled;
      const eligibleAssets =
        config.policy?.entryMode === "ml_score"
          ? getEligibleMlScoreAssets({
              policy: config.policy,
              vaultState: policyRuntime.latestVaultState,
              oracleAssets: policyRuntime.latestOracleAssets,
              mlPicks: policyRuntime.latestMlPicks,
            })
          : config.policy?.entryMode === "quality_score"
            ? getEligibleQualityScoreAssets({
                policy: config.policy,
                vaultState: policyRuntime.latestVaultState,
                oracleAssets: policyRuntime.latestOracleAssets,
                qualityPicks: policyRuntime.latestQualityPicks,
              })
            : getEligibleMomentumVolumeAssets({
                policy: config.policy,
                vaultState: policyRuntime.latestVaultState,
                oracleAssets: policyRuntime.latestOracleAssets,
                quotes: policyRuntime.latestQuotes,
              });
      // Score-passing picks regardless of tracked status — used by the
      // `needsRoll` enforcement branch below to force a wire→set→open
      // sequence when the matrix has rotated onto names the vault has not
      // tracked yet (in which case `eligibleAssets` is empty and the
      // existing `needsEntry` directive silently does nothing).
      const actionablePicks = getActionablePicks({
        policy: config.policy,
        picks:
          config.policy?.entryMode === "quality_score"
            ? policyRuntime.latestQualityPicks
            : config.policy?.entryMode === "ml_score"
              ? policyRuntime.latestMlPicks
              : null,
      });
      const allocationAmountRaw = computeAutoAllocationAmount(
        policyRuntime.latestVaultState,
        config.policy?.autoAllocateTargetBps || 0
      );
      runSummary.policyDiagnostics.eligibleAssetCount = eligibleAssets.length;
      runSummary.policyDiagnostics.eligibleAssetIds = eligibleAssets.map((a) => a.assetId);
      runSummary.policyDiagnostics.eligibleSymbols = eligibleAssets.map((a) => a.symbol);
      runSummary.policyDiagnostics.actionablePickSymbols = actionablePicks.map((p) => p.yahooSymbol);
      runSummary.policyDiagnostics.allocationRequiredRaw = allocationAmountRaw.toString();
      runSummary.policyDiagnostics.allocationWritesExecuted = policyRuntime.allocationWritesExecuted;
      runSummary.policyDiagnostics.opensExecuted = policyRuntime.opensExecuted;
      runSummary.policyDiagnostics.shortOpensExecuted = policyRuntime.shortOpensExecuted;
      runSummary.policyDiagnostics.allocationTriggered =
        policyRuntime.allocationWritesExecuted > 0 || allocationAmountRaw > 0n;
      runSummary.policyDiagnostics.entryTriggered =
        policyRuntime.opensExecuted > 0 || eligibleAssets.length > 0;

      // Cheap pre-LLM guard: reject `allocate_to_perp` calls whose `amount`
      // is "0" when the auto-allocation target is positive. Run 1 of the
      // quality-matrix-manager on 2026-05-21 burned 8 turns and reverted
      // on-chain because the LLM proposed `amount: "0"` against a freshly
      // created (empty) vault, then re-proposed the same call across retries.
      // Replacing the obviously-wrong amount with the runner's computed
      // `allocationAmountRaw` saves a turn and avoids the `Amount required`
      // VaultAccounting revert. Skipped entirely for the (currently unused)
      // case where the policy says no allocation is required this run.
      if (
        policyEnabled &&
        classified.hasWriteCalls &&
        allocationAmountRaw > 0n &&
        policyRuntime.enforcementRounds < 8
      ) {
        const badAllocate = classified.writeCalls.find(
          (c) =>
            c.originalName === "allocate_to_perp" &&
            (c.args?.amount === "0" || c.args?.amount === 0),
        );
        if (badAllocate) {
          const activeVault =
            capturedVaultAddress || state?.vaultAddress || badAllocate.args?.vault || null;
          policyRuntime.enforcementRounds += 1;
          messages.push(choice.message);
          pushRejectedToolResponses(
            messages,
            choice.message.tool_calls,
            `allocate_to_perp amount=0 rejected by runner policy guard; the required allocation amount this run is ${allocationAmountRaw.toString()} USDC base-units.`,
          );
          messages.push({
            role: "user",
            content:
              `Policy violation: allocate_to_perp was called with amount=0 but VaultAccounting requires a positive amount and will revert with "Amount required". ` +
              `The auto-allocation target this run is ${allocationAmountRaw.toString()} USDC base-units (autoAllocateTargetBps=${config.policy?.autoAllocateTargetBps || 0} bps of idle USDC). ` +
              `Retry allocate_to_perp with { vault: "${activeVault}", amount: "${allocationAmountRaw.toString()}" }.`,
          });
          console.log(
            `  [POLICY] Rejected allocate_to_perp amount=0; required allocationAmountRaw=${allocationAmountRaw.toString()}.`,
          );
          continue;
        }
      }

      if (policyEnabled && classified.hasWriteCalls) {
        const violation = validatePolicyWriteBatch({
          classified,
          policy: config.policy,
          opensExecutedSoFar: policyRuntime.opensExecuted,
          shortOpensExecutedSoFar: policyRuntime.shortOpensExecuted,
          eligibleAssets,
          marketRegime: policyRuntime.marketRegime,
          longNewsBySymbol: policyRuntime.longNewsBySymbol,
          assetIdToSymbol: lookupSymbolForAssetId,
        });
        if (violation) {
          policyRuntime.enforcementRounds += 1;
          messages.push(choice.message);
          pushRejectedToolResponses(
            messages,
            choice.message.tool_calls,
            violation,
          );
          messages.push({
            role: "user",
            content:
              `${violation}\n` +
              "Revise your tool calls to satisfy policy constraints. Keep gas usage pragmatic by avoiding unnecessary writes.",
          });
          console.log(`  [POLICY] ${violation}`);
          continue;
        }
      }

      if (CONFIRM_WRITES && !DRY_RUN && classified.hasWriteCalls) {
        const interactiveTty = isInteractiveTty();
        const bypassConfirmation = shouldBypassWriteConfirmation({
          confirmWritesEnabled: CONFIRM_WRITES,
          dryRun: DRY_RUN,
          hasWriteCalls: classified.hasWriteCalls,
          interactiveTty,
          nonInteractiveWriteExecute: NON_INTERACTIVE_WRITE_EXECUTE,
        });
        const skipNonInteractiveWrites = shouldSkipWritesForNonInteractiveSession({
          confirmWritesEnabled: CONFIRM_WRITES,
          dryRun: DRY_RUN,
          hasWriteCalls: classified.hasWriteCalls,
          interactiveTty,
          nonInteractiveWriteExecute: NON_INTERACTIVE_WRITE_EXECUTE,
        });

        if (bypassConfirmation) {
          console.log(
            "  [CONFIRM WRITES] Non-interactive terminal detected with AGENT_NON_INTERACTIVE_WRITE_EXECUTE=1; bypassing confirmation and executing write batch."
          );
          runSummary.confirmationBatches.push({
            turn: turn + 1,
            status: "bypassed-non-interactive-execute",
            interactive: false,
            refinementRounds: 0,
            proposedWriteTools: classified.writeCalls.map((c) => c.toolName),
          });
        } else if (skipNonInteractiveWrites) {
          console.log(
            "  [CONFIRM WRITES] Non-interactive terminal detected; AGENT_NON_INTERACTIVE_WRITE_EXECUTE is disabled, so write calls will be skipped."
          );
          runSummary.confirmationBatches.push({
            turn: turn + 1,
            status: "bypassed-non-interactive-skip-writes",
            interactive: false,
            refinementRounds: 0,
            proposedWriteTools: classified.writeCalls.map((c) => c.toolName),
          });
          skipWritesThisBatch = true;
        } else {
          const confirmation = await confirmWriteBatchInteractively({
            initialChoice: choice,
            initialClassified: classified,
            turn: turn + 1,
            messages,
            openaiTools,
            temperature: config.temperature,
            writeTools: config.writeTools,
          });

          runSummary.confirmationBatches.push({
            turn: turn + 1,
            status: confirmation.status,
            interactive: true,
            refinementRounds: confirmation.refinementRounds,
            proposedWriteTools:
              confirmation.classified?.writeCalls?.map((c) => c.toolName) || [],
          });

          if (confirmation.status === "rejected") {
            messages.push({
              role: "user",
              content:
                "Operator rejected your proposed blockchain write batch. " +
                "Continue with analysis and propose an alternative without executing that write batch.",
            });
            console.log("  [CONFIRM WRITES] Write batch rejected by operator.");
            continue;
          }

          choice = confirmation.choice;
          if (
            choice.finish_reason === "stop" ||
            !choice.message.tool_calls?.length
          ) {
            if (needsNewVault && !capturedVaultAddress && policyRuntime.enforcementRounds < 8) {
              policyRuntime.enforcementRounds += 1;
              messages.push({
                role: "user",
                content:
                  "You still do not have a vault address in memory. Call create_vault now and continue with that vault only. Do not call get_all_vaults unless create_vault fails to return vaultAddress.",
              });
              console.log("  [POLICY] Vault is missing; forcing create_vault before final summary.");
              continue;
            }
            if (choice.message.content) {
              agentSummaryText = redactSecrets(choice.message.content);
              console.log("\n=== Agent Summary ===");
              console.log(agentSummaryText);
            }
            break;
          }

          classified = classifyToolCalls(choice.message.tool_calls, config.writeTools);
        }
      }

      if (
        choice.finish_reason === "stop" ||
        !choice.message.tool_calls?.length
      ) {
        if (needsNewVault && !capturedVaultAddress && policyRuntime.enforcementRounds < 8) {
          policyRuntime.enforcementRounds += 1;
          messages.push(choice.message);
          messages.push({
            role: "user",
            content:
              "You still do not have a vault address in memory. Call create_vault now and continue with that vault only. Do not call get_all_vaults unless create_vault fails to return vaultAddress.",
          });
          console.log("  [POLICY] Vault is missing; forcing create_vault before final summary.");
          continue;
        }
        if (policyEnabled && policyRuntime.enforcementRounds < 8) {
          const activeVault = capturedVaultAddress || state?.vaultAddress || null;
          const needsAllocation =
            activeVault &&
            allocationAmountRaw > 0n &&
            policyRuntime.allocationWritesExecuted === 0;
          const needsEntry =
            activeVault &&
            eligibleAssets.length > 0 &&
            policyRuntime.opensExecuted === 0;
          // Stale tracked-asset set: picks exist above the score gate but
          // none of them are currently tracked by the vault, so
          // `eligibleAssets` is empty and `needsEntry` silently never fires.
          // This is what stalled the quality-matrix-manager on 2026-05-22:
          // the matrix rotated onto GRSL.V / A2GC.V / etc. but the vault's
          // tracked list was still the pre-rotation set, so the run ended
          // with allocate_to_perp and no opens. The directive below forces
          // the LLM to wire missing picks, roll set_vault_assets, then open.
          const needsRoll =
            activeVault &&
            policyRuntime.opensExecuted === 0 &&
            eligibleAssets.length === 0 &&
            actionablePicks.length > 0;
          runSummary.policyDiagnostics.needsRollTriggered = Boolean(needsRoll);

          if (needsAllocation || needsEntry || needsRoll) {
            const policyDirectives = [];
            if (needsAllocation) {
              policyDirectives.push(
                `1) Call allocate_to_perp with { vault: "${activeVault}", amount: "${allocationAmountRaw.toString()}" }.`
              );
            }
            if (needsEntry) {
              const maxOpens = Math.max(0, Number(config.policy.maxNewPositionsPerRun || 0));
              const eligibleList = eligibleAssets
                .slice(0, maxOpens || eligibleAssets.length)
                .map((a) => `${a.symbol} (${a.assetId})`)
                .join(", ");
              policyDirectives.push(
                `2) Open long-only positions on eligible assets (${eligibleList}). Use at most ${maxOpens} new positions this run and choose sizing/collateral pragmatically.`
              );
            }
            if (needsRoll && !needsEntry) {
              const maxOpens = Math.max(0, Number(config.policy.maxNewPositionsPerRun || 0));
              const cap = Math.max(0, Number(config.policy.maxTrackedAssets || 0)) || 12;
              const filterLabel =
                config.policy.entryMode === "ml_score"
                  ? "Atlas ML score"
                  : "Quality Matrix tradeReadinessScore";
              const scoreLabel =
                config.policy.entryMode === "ml_score"
                  ? `mlScore >= ${config.policy.entryMlScoreMin ?? 0}`
                  : `compositeScore >= ${config.policy.entryQualityScoreMin ?? 0}`;
              const oracleSymbolSet = new Set(
                (normalizeOracleAssets(policyRuntime.latestOracleAssets) || [])
                  .map((a) => String(a?.symbol || "").toUpperCase())
                  .filter(Boolean),
              );
              // Strip symbols whose `wire_asset` call structurally failed
              // earlier in this run (e.g. INVALID_SYMBOL_POLICY) so the
              // directive does not keep instructing the LLM to re-wire
              // impossible tickers on every enforcement round.
              const blacklistedSymbols = [...policyRuntime.persistentWireFailures];
              const unwiredPicks = actionablePicks
                .filter((p) => !oracleSymbolSet.has(p.yahooSymbol))
                .filter((p) => !policyRuntime.persistentWireFailures.has(p.yahooSymbol))
                .map((p) => p.yahooSymbol);
              const allPickSymbols = actionablePicks.map((p) => p.yahooSymbol);
              const blacklistNote = blacklistedSymbols.length
                ? ` Skip these symbols entirely for this run (wire_asset already failed with INVALID_SYMBOL_POLICY): ${blacklistedSymbols.join(", ")}.`
                : "";
              policyDirectives.push(
                `3) Your tracked-asset list is stale vs the current top-N (${filterLabel}; ${scoreLabel}). ` +
                  `Current top-N picks: ${allPickSymbols.join(", ") || "(none)"}. ` +
                  `Picks NOT yet wired to the oracle (call yfinance_quote then wire_asset for each, in that order, using the exact priceUsd from yfinance_quote as seedPriceUsd): ${unwiredPicks.join(", ") || "(none)"}.${blacklistNote} ` +
                  `Then call set_vault_assets with the assetIds of the current top-N picks (cap at maxTrackedAssets=${cap}). ` +
                  `Then open up to ${maxOpens} long positions (isLong=true) on the highest-score picks now in the tracked set, sizing pragmatically against the perp capital available in the vault state.`,
              );
            }

            policyRuntime.enforcementRounds += 1;
            messages.push(choice.message);
            messages.push({
              role: "user",
              content:
                "Policy enforcement before final summary:\n" +
                policyDirectives.join("\n") +
                "\nAfter executing required writes, re-read vault state and then summarize.",
            });
            console.log(
              `  [POLICY] Enforcing ${[
                needsAllocation && "allocation",
                needsEntry && "entry",
                needsRoll && !needsEntry && "roll",
              ]
                .filter(Boolean)
                .join("/")} requirements before final summary.`,
            );
            continue;
          }
        }

        if (choice.message.content) {
          agentSummaryText = redactSecrets(choice.message.content);
          console.log("\n=== Agent Summary ===");
          console.log(agentSummaryText);
        }
        break;
      }

      messages.push(choice.message);

      // Risk-officer second-pass: vet the proposed write batch before
      // dispatching. Skipped when:
      //  - AGENT_RISK_OFFICER=0
      //  - there are no write calls this turn
      //  - skipWritesThisBatch already short-circuited execution
      //  - DRY_RUN is active (no writes to vet)
      if (
        RISK_OFFICER_ENABLED &&
        !DRY_RUN &&
        !skipWritesThisBatch &&
        classified.hasWriteCalls
      ) {
        const verdict = await runRiskOfficerForBatch(classified.writeCalls);
        if (verdict.verdict === "veto") {
          policyRuntime.riskOfficerVerdicts.push({
            turn: turn + 1,
            verdict: "veto",
            reason: verdict.reason,
            proposedTools: classified.writeCalls.map((c) => c.originalName || c.toolName),
          });
          pushRejectedToolResponses(
            messages,
            choice.message.tool_calls,
            `risk-officer vetoed the write batch: ${verdict.reason}`,
          );
          messages.push({
            role: "user",
            content:
              `Risk officer VETOED the proposed write batch.\nReason: ${verdict.reason}\n` +
              "Revise your plan and propose an alternative batch — do not retry the same calls verbatim.",
          });
          console.log(`  [RISK-OFFICER] veto: ${verdict.reason}`);
          continue;
        }
        if (verdict.verdict === "downsize") {
          policyRuntime.riskOfficerVerdicts.push({
            turn: turn + 1,
            verdict: "downsize",
            reason: verdict.reason,
            downsizeFactor: verdict.downsizeFactor,
            audit: verdict.audit,
            proposedTools: classified.writeCalls.map((c) => c.originalName || c.toolName),
          });
          console.log(
            `  [RISK-OFFICER] downsized factor=${verdict.downsizeFactor}: ${verdict.reason}`,
          );
        } else {
          policyRuntime.riskOfficerVerdicts.push({
            turn: turn + 1,
            verdict: "approve",
            reason: verdict.reason,
            proposedTools: classified.writeCalls.map((c) => c.originalName || c.toolName),
          });
        }
        // Stash the verdict for executeToolCall so it can stamp it onto
        // runSummary.writeActions[].riskOfficer when the call resolves.
        policyRuntime.pendingRiskOfficerVerdict = verdict;
      } else {
        policyRuntime.pendingRiskOfficerVerdict = null;
      }

      for (const call of classified.calls) {
        await executeToolCall(call, { forceSkipWrites: skipWritesThisBatch });
      }
      policyRuntime.pendingRiskOfficerVerdict = null;
    }

    // --- Persist memory ---
    runSummary.finishedAt = new Date().toISOString();
    runSummary.summary = agentSummaryText ? agentSummaryText.slice(0, 500) : "";

    const extractedThesis = extractThesis(agentSummaryText);

    let persistedState = null;
    if (vaultOverrideActive) {
      console.log(
        "Memory: vault override active — skipping state/metadata/run-log writes."
      );
    } else if (capturedVaultAddress) {
      const newState = {
        vaultAddress: capturedVaultAddress,
        vaultName: config.vaultName || config.name,
        agentFileHash: config.fileHash,
        deploymentFingerprint: deploymentContext.fingerprint,
        deploymentConfigPath: deploymentContext.deploymentConfigPath,
        deployedAt:
          didCreateVault && capturedVaultAddress !== state?.vaultAddress
            ? runSummary.startedAt
            : state?.deployedAt || runSummary.startedAt,
        lastRunAt: runSummary.finishedAt,
      };
      if (extractedThesis) {
        newState.thesis = extractedThesis;
        newState.lastThesisUpdate = runSummary.finishedAt;
      } else if (state?.thesis) {
        newState.thesis = state.thesis;
        newState.lastThesisUpdate = state.lastThesisUpdate;
      }
      try {
        await memory.writeState(newState);
        console.log(`\nMemory: state saved (vault ${capturedVaultAddress}) via ${memory.mode} adapter`);
      } catch (err) {
        const safeErr = redactSecrets(err.message || String(err));
        console.error(`Memory: writeState failed via ${memory.mode} adapter: ${safeErr}`);
        runSummary.errors.push({ tool: "_memory_write_state", error: safeErr });
      }
      if (extractedThesis) {
        console.log(`Memory: thesis updated (${extractedThesis.slice(0, 80)}...)`);
      }
      try {
        await memory.publishAgentMetadata({ config, state: newState, runSummary });
      } catch (err) {
        const safeErr = redactSecrets(err.message || String(err));
        console.error(`Memory: publishAgentMetadata failed via ${memory.mode} adapter: ${safeErr}`);
        runSummary.errors.push({ tool: "_memory_publish_metadata", error: safeErr });
      }
      persistedState = newState;
    } else if (state) {
      const updatedState = {
        ...state,
        agentFileHash: config.fileHash,
        deploymentFingerprint: deploymentContext.fingerprint,
        deploymentConfigPath: deploymentContext.deploymentConfigPath,
        lastRunAt: runSummary.finishedAt,
      };
      if (extractedThesis) {
        updatedState.thesis = extractedThesis;
        updatedState.lastThesisUpdate = runSummary.finishedAt;
      }
      try {
        await memory.writeState(updatedState);
      } catch (err) {
        const safeErr = redactSecrets(err.message || String(err));
        console.error(`Memory: writeState failed via ${memory.mode} adapter: ${safeErr}`);
        runSummary.errors.push({ tool: "_memory_write_state", error: safeErr });
      }
      if (extractedThesis) {
        console.log(`Memory: thesis updated (${extractedThesis.slice(0, 80)}...)`);
      }
      try {
        await memory.publishAgentMetadata({ config, state: updatedState, runSummary });
      } catch (err) {
        const safeErr = redactSecrets(err.message || String(err));
        console.error(`Memory: publishAgentMetadata failed via ${memory.mode} adapter: ${safeErr}`);
        runSummary.errors.push({ tool: "_memory_publish_metadata", error: safeErr });
      }
      persistedState = updatedState;
    }

    const summarySnippet = runSummary.summary || "";
    if (vaultOverrideActive) {
      // Already logged above; skip run-log append for one-off override runs.
    } else if (DRY_RUN) {
      console.log("Memory: dry run active — run log not updated.");
    } else {
      try {
        // SECURITY: deep-redact the run-log payload because it gets committed
        // back to the default branch by the `commit-results` job.
        await memory.appendRunLog(redactSecretsDeep({
          timestamp: runSummary.finishedAt,
          agent: config.name,
          network: runNetwork,
          vault: capturedVaultAddress || null,
          turns: runSummary.turns,
          toolCalls: runSummary.toolCalls,
          writeActions: runSummary.writeActions,
          closedPositions: runSummary.closedPositions || [],
          riskOfficerVerdicts: policyRuntime.riskOfficerVerdicts || [],
          confirmationBatches: runSummary.confirmationBatches,
          errors: runSummary.errors,
          softFailures: runSummary.softFailures || [],
          summary: summarySnippet,
        }));
        console.log(`Memory: run log appended via ${memory.mode} adapter.`);
      } catch (err) {
        const safeErr = redactSecrets(err.message || String(err));
        console.error(`Memory: appendRunLog failed via ${memory.mode} adapter: ${safeErr}`);
        runSummary.errors.push({ tool: "_memory_append_runlog", error: safeErr });
      }
    }

    // Paperclip bridge: write `paperclip-heartbeat.json` so the operator's
    // Paperclip install (see COMPANY.md) can ingest a summary of this run
    // on its next sync. Match the run-log gating so dry runs and one-off
    // vault-override runs don't overwrite the last real heartbeat.
    if (!vaultOverrideActive && !DRY_RUN) {
      try {
        await memory.publishPaperclipHeartbeat({
          config,
          state: persistedState,
          runSummary,
          network: runNetwork,
          status: runSummary.errors.length > 0 ? "succeeded_with_errors" : "succeeded",
        });
      } catch (err) {
        const safeErr = redactSecrets(err.message || String(err));
        console.error(
          `Memory: publishPaperclipHeartbeat failed via ${memory.mode} adapter: ${safeErr}`,
        );
        runSummary.errors.push({
          tool: "_memory_publish_paperclip_heartbeat",
          error: safeErr,
        });
      }
    }

    void persistedState;
    console.log("\n=== Run Summary (JSON) ===");
    console.log(JSON.stringify(redactSecretsDeep(runSummary), null, 2));
  } catch (err) {
    runSummary.finishedAt = new Date().toISOString();
    const safeAgentErr = redactSecrets(err.message || String(err));
    runSummary.errors.push({
      tool: "_agent",
      error: safeAgentErr,
    });
    console.error("Agent failed:", safeAgentErr);

    // Persist failure log unless this is a dry run or a vault-override run.
    if (vaultOverrideActive) {
      console.log("Memory: vault override active — failure not written to run log.");
    } else if (!DRY_RUN) {
      try {
        // SECURITY: deep-redact the failure log payload (committed back to git).
        await memory.appendRunLog(redactSecretsDeep({
          timestamp: runSummary.finishedAt,
          agent: config.name,
          network: runNetwork,
          vault: capturedVaultAddress || null,
          turns: runSummary.turns,
          toolCalls: runSummary.toolCalls,
          writeActions: runSummary.writeActions,
          closedPositions: runSummary.closedPositions || [],
          confirmationBatches: runSummary.confirmationBatches,
          errors: runSummary.errors,
          softFailures: runSummary.softFailures || [],
          summary: "FAILED: " + safeAgentErr,
        }));
      } catch (logErr) {
        const safeLogErr = redactSecrets(logErr.message || String(logErr));
        console.error(`Memory: failed to record failure log via ${memory.mode} adapter: ${safeLogErr}`);
      }
      // Paperclip bridge: surface the failure heartbeat too so the
      // operator's dashboard reflects red status on the next sync.
      try {
        await memory.publishPaperclipHeartbeat({
          config,
          state: state ?? null,
          runSummary: {
            ...runSummary,
            summary: "FAILED: " + safeAgentErr,
          },
          network: runNetwork,
          status: "failed",
        });
      } catch (heartbeatErr) {
        const safeHbErr = redactSecrets(heartbeatErr.message || String(heartbeatErr));
        console.error(
          `Memory: publishPaperclipHeartbeat failed via ${memory.mode} adapter: ${safeHbErr}`,
        );
      }
    } else {
      console.log("Memory: dry run active — failure not written to run log.");
    }

    console.log("\n=== Run Summary (JSON) ===");
    console.log(JSON.stringify(redactSecretsDeep(runSummary), null, 2));
    throw err;
  } finally {
    for (const mc of mcpClients) {
      try {
        await mc.client.close();
      } catch {}
    }
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const isDirectCliEntry =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectCliEntry) {
  const agentName = process.argv[2];
  if (agentName) {
    runAgent(agentName).catch(() => process.exit(1));
  }
}

export const __agentRunnerInternals = {
  applyVaultArgPin,
  VAULT_ARG_WRITE_TOOLS,
  sanitizeNetworkKey,
  buildDeploymentFingerprint,
  shortHash,
  shouldInvalidateDeploymentMemory,
  resolveVaultLifecycle,
  parseVaultOverride,
  rotateFileToArchive,
  rotateAgentMemoryForDeploymentChange,
  parseAgentPolicy,
  computeAutoAllocationAmount,
  normalizeOracleAssets,
  getEligibleMomentumVolumeAssets,
  getEligibleMlScoreAssets,
  getEligibleQualityScoreAssets,
  getActionablePicks,
  validatePolicyWriteBatch,
  computeAutoRebalanceClosures,
  computeRankSwapClosures,
  computePnlBandClosures,
  parseWriteConfirmationCommand,
  pushRejectedToolResponses,
  extractThesis,
  extractNewestVaultAddress,
  extractVaultAddressFromCreateVaultResponse,
  recordMcpErrorIfPresent,
  classifyMcpErrorPayload,
  SOFT_REFUSAL_ERROR_CODES,
  MCP_ERROR_MAX_CHARS,
  verifyVaultNameMatch,
  publishAgentMetadata,
  publishPaperclipHeartbeat,
  summarizeActionParams,
  parseRetryAfterHeader,
  parseRetryHintFromBody,
  computeRetryWaitMs,
  RETRY_ATTEMPTS,
  RETRY_BASE_MS,
  RETRY_MAX_MS,
  RETRY_HINT_PAD_MS,
  modelRequiresResponsesApi,
  translateToResponsesRequest,
  translateFromResponsesResponse,
};
