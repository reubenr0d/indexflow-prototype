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
 *   - Vault address capture from create_vault / get_all_vaults results
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
 *   AGENT_CONFIRM_WRITES      - Set to "1" to require operator approval before write batches
 *   AGENT_MAX_TOOL_RESPONSE   - Max chars from tool response sent to LLM (default 6000)
 *   AGENT_NETWORK             - Optional network key for run log files
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
  isInteractiveTty,
} from "./agent-runner-confirmation.mjs";

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

function hashContent(content) {
  return "sha256:" + createHash("sha256").update(content, "utf8").digest("hex");
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
const CONFIRM_WRITES = ["1", "true", "yes"].includes(
  (process.env.AGENT_CONFIRM_WRITES || "").toLowerCase()
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
// LLM API with retry (exponential backoff on 429 / 5xx)
// ---------------------------------------------------------------------------

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_MS = 2000;

async function chatCompletion(messages, tools, temperature) {
  const body = { model: LLM_MODEL, messages, tools, temperature };

  let lastError;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LLM_API_KEY}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) return res.json();

      const text = await res.text();
      lastError = new Error(`LLM API ${res.status}: ${text}`);

      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt === RETRY_ATTEMPTS - 1) throw lastError;

      const waitMs = RETRY_BASE_MS * Math.pow(2, attempt);
      console.log(
        `  LLM ${res.status}, retrying in ${waitMs}ms (attempt ${attempt + 1}/${RETRY_ATTEMPTS})...`
      );
      await new Promise((r) => setTimeout(r, waitMs));
    } catch (err) {
      if (err === lastError) throw err;
      lastError = err;
      if (attempt === RETRY_ATTEMPTS - 1) throw err;
      const waitMs = RETRY_BASE_MS * Math.pow(2, attempt);
      console.log(`  LLM error: ${err.message}, retrying in ${waitMs}ms...`);
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
      `- Then call get_all_vaults to find the new vault address\n` +
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

  // Dry-run notice
  const dryRunNotice = DRY_RUN
    ? "\n\n## Dry Run Mode\nDRY RUN IS ACTIVE: Report what you would do but do NOT call write tools."
    : "\n\n## Dry Run Mode\nLive mode: you may execute write operations.";
  prompt += dryRunNotice;

  return prompt;
}

// ---------------------------------------------------------------------------
// Extract vault address from get_all_vaults response
// ---------------------------------------------------------------------------

function extractNewestVaultAddress(content, vaultName) {
  try {
    const data = JSON.parse(content);
    if (data.vaults && Array.isArray(data.vaults) && data.vaults.length > 0) {
      if (vaultName) {
        const match = data.vaults.find(
          (v) => v.name && v.name.toLowerCase() === vaultName.toLowerCase()
        );
        if (match) return match.address;
      }
      return data.vaults[data.vaults.length - 1].address;
    }
  } catch {}
  return null;
}

function renderToolCallLine(call) {
  return `- ${call.toolName}(${JSON.stringify(call.args)})`;
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
        "Type 'approve' to execute, 'reject' to skip writes, or provide feedback for revision: "
      );
      const input = rawInput.trim();
      const command = input.toLowerCase();

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
// Public API
// ---------------------------------------------------------------------------

export async function runAgent(agentName) {
  if (!LLM_API_KEY) {
    console.error("LLM_API_KEY is required");
    process.exit(1);
  }

  const config = loadAgentConfig(agentName);
  const runNetwork = resolveRunNetworkKey();
  const runLogFile = `run-log.${runNetwork}.jsonl`;
  const deploymentContext = buildDeploymentFingerprint(runNetwork);
  const maxTurns = parseInt(
    process.env.AGENT_MAX_TURNS || String(config.maxTurns),
    10
  );

  // --- Memory: load state and determine vault lifecycle ---
  let state = readState(agentName);
  let recentRuns = readRecentRunLog(agentName, runNetwork, 5);
  if (shouldInvalidateDeploymentMemory(state, deploymentContext.fingerprint)) {
    const rotation = rotateAgentMemoryForDeploymentChange(
      agentName,
      runNetwork,
      state?.deploymentFingerprint || null,
      deploymentContext.fingerprint
    );
    const previousFingerprintLabel = state?.deploymentFingerprint
      ? shortHash(state.deploymentFingerprint)
      : "legacy";
    console.log(
      `Memory: deployment context changed (${previousFingerprintLabel} -> ${shortHash(deploymentContext.fingerprint)}) — invalidating state and ${runLogFile}.`
    );
    if (rotation.stateArchivePath) {
      console.log(`Memory: archived state -> ${rotation.stateArchivePath}`);
    }
    if (rotation.runLogArchivePath) {
      console.log(`Memory: archived run log -> ${rotation.runLogArchivePath}`);
    }
    state = null;
    recentRuns = [];
  }
  const needsNewVault =
    !state || !state.vaultAddress || state.agentFileHash !== config.fileHash;

  if (needsNewVault) {
    if (!state) {
      console.log("Memory: no state found — agent will deploy a new vault.");
    } else if (state.agentFileHash !== config.fileHash) {
      console.log(
        "Memory: agent .md file changed — agent will deploy a new vault."
      );
    } else {
      console.log("Memory: no vault address — agent will deploy a new vault.");
    }
  } else {
    console.log(`Memory: vault ${state.vaultAddress} (${state.vaultName})`);
  }
  if (recentRuns.length > 0) {
    console.log(
      `Memory: ${recentRuns.length} recent run(s) loaded from ${runLogFile}.`
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
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };

  console.log(`\n=== Agent: ${config.name} ===`);
  if (config.description) console.log(`Description: ${config.description}`);
  console.log(`Model: ${LLM_MODEL}`);
  console.log(`Max turns: ${maxTurns}`);
  console.log(`Dry run: ${DRY_RUN}`);
  console.log(`Confirm writes: ${CONFIRM_WRITES}`);
  console.log(`Run network: ${runNetwork}`);
  console.log(`Run log file: ${runLogFile}`);
  console.log(`Tool response budget: ${MAX_TOOL_RESPONSE} chars`);
  console.log(
    `MCP servers: ${config.mcpServers.map((s) => s.name).join(", ") || "(none)"}`
  );
  console.log("");

  const mcpClients = [];
  let capturedVaultAddress = state?.vaultAddress || null;
  let agentSummaryText = null;
  let didCreateVault = false;

  try {
    for (const serverDef of config.mcpServers) {
      console.log(`Spawning MCP server: ${serverDef.name}...`);
      const mc = await spawnMcpClient(serverDef);
      mcpClients.push(mc);
      console.log(`  Tools: ${mc.tools.map((t) => t.name).join(", ")}`);
    }
    console.log("");

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

    async function executeToolCall(call) {
      const { toolCall, toolName, originalName, args, isWrite } = call;
      console.log(`  Tool: ${toolName}(${JSON.stringify(args)})`);
      runSummary.toolCalls.push(toolName);

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

      if (DRY_RUN && isWrite) {
        const skipMsg = `[DRY RUN] Skipped write tool: ${toolName}`;
        console.log(`  ${skipMsg}`);
        runSummary.writeActions.push({
          tool: toolName,
          args,
          skipped: true,
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
        const content = result.content
          .map((c) => (c.type === "text" ? c.text : JSON.stringify(c)))
          .join("\n");

        const preview =
          content.slice(0, 200) + (content.length > 200 ? "..." : "");
        console.log(`  Result: ${preview}`);

        if (isWrite) {
          runSummary.writeActions.push({
            tool: toolName,
            args,
            skipped: false,
          });
        }

        // --- Vault address capture ---
        if (originalName === "create_vault") {
          didCreateVault = true;
        }
        if (
          originalName === "get_all_vaults" &&
          didCreateVault &&
          !capturedVaultAddress
        ) {
          const addr = extractNewestVaultAddress(content, config.vaultName);
          if (addr) {
            capturedVaultAddress = addr;
            console.log(`  >> Captured new vault address: ${addr}`);
          }
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: truncateForLLM(content),
        });
      } catch (err) {
        const errMsg = `Tool error: ${err.message}`;
        console.error(`  ${errMsg}`);
        runSummary.errors.push({ tool: toolName, error: err.message });
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: errMsg,
        });
      }
    }

    for (let turn = 0; turn < maxTurns; turn++) {
      runSummary.turns = turn + 1;
      console.log(`--- Turn ${turn + 1}/${maxTurns} ---`);

      const response = await chatCompletion(
        messages,
        openaiTools,
        config.temperature
      );
      let choice = response.choices[0];
      let classified = classifyToolCalls(
        choice.message.tool_calls || [],
        config.writeTools
      );

      if (CONFIRM_WRITES && !DRY_RUN && classified.hasWriteCalls) {
        const bypassConfirmation = shouldBypassWriteConfirmation({
          confirmWritesEnabled: CONFIRM_WRITES,
          dryRun: DRY_RUN,
          hasWriteCalls: classified.hasWriteCalls,
          interactiveTty: isInteractiveTty(),
        });

        if (bypassConfirmation) {
          console.log(
            "  [CONFIRM WRITES] Non-interactive terminal detected; bypassing confirmation and executing write batch."
          );
          runSummary.confirmationBatches.push({
            turn: turn + 1,
            status: "bypassed-non-interactive",
            interactive: false,
            refinementRounds: 0,
            proposedWriteTools: classified.writeCalls.map((c) => c.toolName),
          });
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
            if (choice.message.content) {
              agentSummaryText = choice.message.content;
              console.log("\n=== Agent Summary ===");
              console.log(choice.message.content);
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
        if (choice.message.content) {
          agentSummaryText = choice.message.content;
          console.log("\n=== Agent Summary ===");
          console.log(choice.message.content);
        }
        break;
      }

      messages.push(choice.message);
      for (const call of classified.calls) {
        await executeToolCall(call);
      }
    }

    // --- Persist memory ---
    runSummary.finishedAt = new Date().toISOString();

    if (capturedVaultAddress) {
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
      writeState(agentName, newState);
      console.log(`\nMemory: state saved (vault ${capturedVaultAddress})`);
    } else if (state) {
      const updatedState = {
        ...state,
        agentFileHash: config.fileHash,
        deploymentFingerprint: deploymentContext.fingerprint,
        deploymentConfigPath: deploymentContext.deploymentConfigPath,
        lastRunAt: runSummary.finishedAt,
      };
      writeState(agentName, updatedState);
    }

    const summarySnippet = agentSummaryText
      ? agentSummaryText.slice(0, 500)
      : "";
    if (DRY_RUN) {
      console.log("Memory: dry run active — run log not updated.");
    } else {
      appendRunLog(agentName, runNetwork, {
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
      });
      console.log("Memory: run log appended.");
    }

    console.log("\n=== Run Summary (JSON) ===");
    console.log(JSON.stringify(runSummary, null, 2));
  } catch (err) {
    runSummary.finishedAt = new Date().toISOString();
    runSummary.errors.push({
      tool: "_agent",
      error: err.message || String(err),
    });
    console.error("Agent failed:", err.message || err);

    // Persist failure log unless this is a dry run.
    if (!DRY_RUN) {
      appendRunLog(agentName, runNetwork, {
        timestamp: runSummary.finishedAt,
        agent: config.name,
        network: runNetwork,
        vault: capturedVaultAddress || null,
        turns: runSummary.turns,
        toolCalls: runSummary.toolCalls,
        writeActions: runSummary.writeActions,
        confirmationBatches: runSummary.confirmationBatches,
        errors: runSummary.errors,
        summary: "FAILED: " + (err.message || String(err)),
      });
    } else {
      console.log("Memory: dry run active — failure not written to run log.");
    }

    console.log("\n=== Run Summary (JSON) ===");
    console.log(JSON.stringify(runSummary, null, 2));
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
  rotateFileToArchive,
  rotateAgentMemoryForDeploymentChange,
};
