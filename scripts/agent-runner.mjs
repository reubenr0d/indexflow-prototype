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
} from "./agent-runner-confirmation.mjs";
import { redactSecrets, redactSecretsDeep } from "./lib/redact-secrets.mjs";

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
    frontmatter.rebalanceMode !== undefined;

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
    fileHash,
  };
}

// ---------------------------------------------------------------------------
// Global env config
// ---------------------------------------------------------------------------

const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_BASE_URL = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
const LLM_MODEL = process.env.LLM_MODEL || "gpt-4o";
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

// Optional `stats` accumulator: if provided, retry count + total wait time are
// added to it so the caller can surface the wall-clock cost of 429/5xx retries
// separately from the agent turn counter (retries never consume turns).
async function chatCompletion(messages, tools, temperature, stats = null) {
  const endpoint = `${LLM_BASE_URL}/chat/completions`;
  const body = { model: LLM_MODEL, messages, tools, temperature };

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
        return await res.json();
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

function getEligibleMomentumVolumeAssets({ policy, vaultState, oracleAssets, quotes }) {
  if (
    !policy?.enabled ||
    policy.entryMode !== "momentum_volume" ||
    !vaultState ||
    !Array.isArray(vaultState.assets) ||
    !Array.isArray(oracleAssets?.assets) ||
    !Array.isArray(quotes)
  ) {
    return [];
  }

  const trackedAssetIds = new Set(vaultState.assets.map((a) => String(a).toLowerCase()));
  const oracleBySymbol = new Map();
  for (const asset of oracleAssets.assets) {
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
  if (
    !policy?.enabled ||
    policy.entryMode !== "quality_score" ||
    !vaultState ||
    !Array.isArray(vaultState.assets) ||
    !Array.isArray(oracleAssets?.assets) ||
    !Array.isArray(qualityPicks)
  ) {
    return [];
  }

  const trackedAssetIds = new Set(vaultState.assets.map((a) => String(a).toLowerCase()));
  const oracleBySymbol = new Map();
  for (const asset of oracleAssets.assets) {
    const symbol = String(asset.symbol || "").toUpperCase();
    if (!symbol) continue;
    if (!trackedAssetIds.has(String(asset.assetId || "").toLowerCase())) continue;
    oracleBySymbol.set(symbol, asset);
  }

  const minScore = Number(policy.entryQualityScoreMin ?? 0);
  const eligible = [];
  for (const pick of qualityPicks) {
    if (!pick) continue;
    const compositeScore = Number(pick.compositeScore ?? pick.composite ?? 0);
    if (!Number.isFinite(compositeScore) || compositeScore < minScore) continue;
    const yahooSymbol = String(pick.yahooSymbol || "").toUpperCase();
    if (!yahooSymbol) continue;
    const oracleAsset = oracleBySymbol.get(yahooSymbol);
    if (!oracleAsset) continue;
    eligible.push({
      assetId: oracleAsset.assetId,
      symbol: oracleAsset.symbol,
      compositeScore,
      tier: pick.tier ?? null,
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

function getEligibleMlScoreAssets({ policy, vaultState, oracleAssets, mlPicks }) {
  if (
    !policy?.enabled ||
    policy.entryMode !== "ml_score" ||
    !vaultState ||
    !Array.isArray(vaultState.assets) ||
    !Array.isArray(oracleAssets?.assets) ||
    !Array.isArray(mlPicks)
  ) {
    return [];
  }

  const trackedAssetIds = new Set(vaultState.assets.map((a) => String(a).toLowerCase()));
  const oracleBySymbol = new Map();
  for (const asset of oracleAssets.assets) {
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

function validatePolicyWriteBatch({
  classified,
  policy,
  opensExecutedSoFar,
  shortOpensExecutedSoFar = 0,
  eligibleAssets,
}) {
  if (!policy?.enabled || !classified?.hasWriteCalls) return null;

  const openCalls = classified.writeCalls.filter((c) => c.originalName === "open_position");
  if (openCalls.length === 0) return null;

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
        ? "Quality Matrix composite score"
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

function buildSystemPrompt(config, state, recentRuns, needsNewVault) {
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
        prompt += `\n- Entry trigger: Quality Matrix composite score >= ${config.policy.entryQualityScoreMin}`;
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

// Pure helper for executeToolCall: inspects an MCP tool response and, if it
// signals failure via the MCP `isError: true` convention, records it on the
// shared run summary + policy runtime. Returns true iff the response was an
// error, so the caller can branch (e.g. skip vault-address capture from a
// follow-up get_all_vaults). Exported via __agentRunnerInternals for tests.
function recordMcpErrorIfPresent({
  result,
  content,
  runSummary,
  policyRuntime,
  toolName,
  originalName,
}) {
  if (result?.isError !== true) return false;
  const failurePreview = String(content ?? "").slice(0, 500);
  runSummary.errors.push({ tool: toolName, error: failurePreview });
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

function publishAgentMetadata(config, currentState, runSummary) {
  if (!currentState?.vaultAddress) return;
  const metaDir = resolve(PROJECT_ROOT, "apps/web/public/agent-metadata");
  mkdirSync(metaDir, { recursive: true });
  const addr = currentState.vaultAddress.toLowerCase();
  const metaPath = resolve(metaDir, `${addr}.json`);

  const runId = runSummary.finishedAt;

  const recentActions = (runSummary.writeActions || [])
    .filter((a) => !a.skipped && a.justification)
    .map((a) => ({
      tool: a.tool,
      justification: a.justification,
      timestamp: runSummary.finishedAt,
      txHash: a.txHash || null,
      agentName: config.name,
      runId,
    }));

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
  console.log(`  Model: ${LLM_MODEL}`);

  const config = loadAgentConfig(agentName);
  const runNetwork = resolveRunNetworkKey();
  const runLogFile = `run-log.${runNetwork}.jsonl`;
  const deploymentContext = buildDeploymentFingerprint(runNetwork);
  const maxTurns = parseInt(
    process.env.AGENT_MAX_TURNS || String(config.maxTurns),
    10
  );

  console.log(`\n=== Agent: ${config.name} ===`);
  if (config.description) console.log(`Description: ${config.description}`);
  console.log(`Model: ${LLM_MODEL}`);
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
    opensExecuted: 0,
    shortOpensExecuted: 0,
    allocationWritesExecuted: 0,
    enforcementRounds: 0,
    // Set to true when create_vault returns an MCP error response (isError:true).
    // Suppresses the get_all_vaults-based address fallback so a failed deployment
    // cannot silently "steal" another agent's vault address. See the 2026-05-21
    // VA-migration regression for the cross-agent contamination this prevents.
    createVaultFailedThisRun: false,
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
    model: LLM_MODEL,
    dryRun: DRY_RUN,
    confirmWrites: CONFIRM_WRITES,
    network: runNetwork,
    turns: 0,
    toolCalls: [],
    writeActions: [],
    confirmationBatches: [],
    errors: [],
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

    const systemPrompt = buildSystemPrompt(
      config,
      state,
      recentRuns,
      needsNewVault
    );

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: config.userPrompt },
    ];

    async function executeToolCall(call, { forceSkipWrites = false } = {}) {
      const { toolCall, toolName, originalName, args, isWrite } = call;
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
          runSummary.writeActions.push({
            tool: toolName,
            args,
            skipped: false,
            failed: isMcpError || undefined,
            justification: args.justification || null,
          });
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
          originalName === "get_quality_top_picks" &&
          parsed &&
          Array.isArray(parsed.picks)
        ) {
          policyRuntime.latestQualityPicks = parsed.picks;
        }
        if (originalName === "allocate_to_perp" && parsed?.success === true) {
          policyRuntime.allocationWritesExecuted += 1;
        }
        if (originalName === "open_position" && parsed?.success === true) {
          policyRuntime.opensExecuted += 1;
          if (call.args?.isLong === false) {
            policyRuntime.shortOpensExecuted += 1;
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
    async function runMcpTool(toolName, args, { isWrite = false } = {}) {
      const entry = toolMap.get(toolName);
      if (!entry) {
        throw new Error(`Auto-rebalance: tool not available in this run: ${toolName}`);
      }
      if ((DRY_RUN || (CONFIRM_WRITES && !NON_INTERACTIVE_WRITE_EXECUTE && !isInteractiveTty())) && isWrite) {
        console.log(`  [AUTO-REBALANCE] Skipped write tool ${toolName} (dry/non-interactive).`);
        runSummary.writeActions.push({
          tool: toolName,
          args,
          skipped: true,
          justification: "auto-rebalance: dropped from ML top-N (skipped due to dry/non-interactive)",
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
          justification: "auto-rebalance: dropped from ML top-N",
          txHash: parsed?.transactionHash ?? null,
        });
      }
      return { content, parsed: parseJsonText(content) };
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
        const positionsParsed = positionsRes.parsed;
        const positions = Array.isArray(positionsParsed?.positions) ? positionsParsed.positions : [];
        if (positions.length === 0) {
          console.log("[AUTO-REBALANCE] No open positions; nothing to close.");
          return;
        }

        const isQuality = policy.entryMode === "quality_score";
        const minScore = Number(
          isQuality ? policy.entryQualityScoreMin ?? 0 : policy.entryMlScoreMin ?? 0,
        );
        const cap = Math.max(0, Number(policy.maxTrackedAssets ?? 0)) || 10;
        const picksToolName = isQuality ? "get_quality_top_picks" : "get_ml_top_picks";
        const picksArgs = isQuality
          ? { limit: cap, minCompositeScore: minScore }
          : { limit: cap, minScore };
        const picksRes = await runMcpTool(picksToolName, picksArgs);
        const picksParsed = picksRes.parsed;
        const picks = Array.isArray(picksParsed?.picks) ? picksParsed.picks : [];

        const eligibleSymbols = new Set(
          picks
            .map((p) => String(p.yahooSymbol || "").toUpperCase())
            .filter(Boolean),
        );

        const closures = computeAutoRebalanceClosures({
          policy,
          positions,
          eligibleSymbols,
          minScore,
          cap,
          signalLabel: isQuality ? "Quality top" : "ML top",
        });

        runSummary.policyDiagnostics.autoExitsAttempted = closures.length;
        if (closures.length === 0) {
          const label = isQuality ? `Quality top-${cap}` : `ML top-${cap}`;
          console.log(
            `[AUTO-REBALANCE] All ${positions.length} open positions remain in ${label}; nothing to close.`,
          );
          return;
        }

        for (const { pos, reason } of closures) {
          console.log(
            `[AUTO-REBALANCE] Closing ${pos.symbol || pos.assetId} (isLong=${pos.isLong}): ${reason}`,
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
                justification: `auto-rebalance: ${reason}`,
              },
              { isWrite: true },
            );
            if (closeRes.parsed?.success === true) {
              runSummary.policyDiagnostics.autoExitsClosed += 1;
            }
          } catch (err) {
            const safeErr = redactSecrets(err.message || String(err));
            console.error(`[AUTO-REBALANCE] close_position failed for ${pos.symbol}: ${safeErr}`);
            runSummary.errors.push({ tool: "close_position", error: safeErr });
          }
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
      const allocationAmountRaw = computeAutoAllocationAmount(
        policyRuntime.latestVaultState,
        config.policy?.autoAllocateTargetBps || 0
      );
      runSummary.policyDiagnostics.eligibleAssetCount = eligibleAssets.length;
      runSummary.policyDiagnostics.eligibleAssetIds = eligibleAssets.map((a) => a.assetId);
      runSummary.policyDiagnostics.eligibleSymbols = eligibleAssets.map((a) => a.symbol);
      runSummary.policyDiagnostics.allocationRequiredRaw = allocationAmountRaw.toString();
      runSummary.policyDiagnostics.allocationWritesExecuted = policyRuntime.allocationWritesExecuted;
      runSummary.policyDiagnostics.opensExecuted = policyRuntime.opensExecuted;
      runSummary.policyDiagnostics.shortOpensExecuted = policyRuntime.shortOpensExecuted;
      runSummary.policyDiagnostics.allocationTriggered =
        policyRuntime.allocationWritesExecuted > 0 || allocationAmountRaw > 0n;
      runSummary.policyDiagnostics.entryTriggered =
        policyRuntime.opensExecuted > 0 || eligibleAssets.length > 0;

      if (policyEnabled && classified.hasWriteCalls) {
        const violation = validatePolicyWriteBatch({
          classified,
          policy: config.policy,
          opensExecutedSoFar: policyRuntime.opensExecuted,
          shortOpensExecutedSoFar: policyRuntime.shortOpensExecuted,
          eligibleAssets,
        });
        if (violation) {
          policyRuntime.enforcementRounds += 1;
          messages.push(choice.message);
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

          if (needsAllocation || needsEntry) {
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

            policyRuntime.enforcementRounds += 1;
            messages.push(choice.message);
            messages.push({
              role: "user",
              content:
                "Policy enforcement before final summary:\n" +
                policyDirectives.join("\n") +
                "\nAfter executing required writes, re-read vault state and then summarize.",
            });
            console.log("  [POLICY] Enforcing allocation/entry requirements before final summary.");
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
      for (const call of classified.calls) {
        await executeToolCall(call, { forceSkipWrites: skipWritesThisBatch });
      }
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
          confirmationBatches: runSummary.confirmationBatches,
          errors: runSummary.errors,
          summary: summarySnippet,
        }));
        console.log(`Memory: run log appended via ${memory.mode} adapter.`);
      } catch (err) {
        const safeErr = redactSecrets(err.message || String(err));
        console.error(`Memory: appendRunLog failed via ${memory.mode} adapter: ${safeErr}`);
        runSummary.errors.push({ tool: "_memory_append_runlog", error: safeErr });
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
          confirmationBatches: runSummary.confirmationBatches,
          errors: runSummary.errors,
          summary: "FAILED: " + safeAgentErr,
        }));
      } catch (logErr) {
        const safeLogErr = redactSecrets(logErr.message || String(logErr));
        console.error(`Memory: failed to record failure log via ${memory.mode} adapter: ${safeLogErr}`);
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
  getEligibleMomentumVolumeAssets,
  getEligibleMlScoreAssets,
  getEligibleQualityScoreAssets,
  validatePolicyWriteBatch,
  computeAutoRebalanceClosures,
  parseWriteConfirmationCommand,
  extractThesis,
  extractNewestVaultAddress,
  extractVaultAddressFromCreateVaultResponse,
  recordMcpErrorIfPresent,
  verifyVaultNameMatch,
  publishAgentMetadata,
  parseRetryAfterHeader,
  parseRetryHintFromBody,
  computeRetryWaitMs,
  RETRY_ATTEMPTS,
  RETRY_BASE_MS,
  RETRY_MAX_MS,
  RETRY_HINT_PAD_MS,
};
