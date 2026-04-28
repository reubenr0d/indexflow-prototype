/**
 * 0G-storage-backed memory adapter for the agent runner.
 *
 * Provides the same interface as the legacy file-based helpers
 * (readState / writeState / appendRunLog / readRecentRunLog /
 * publishAgentMetadata) but routes everything through the 0g-storage MCP
 * (state_get_all / state_set / log_append / runlog_recent /
 * vault_metadata_set).
 *
 * State keys live under the MCP's automatic `<wallet>:<agent>:` prefix.
 * The adapter also maintains a tiny gitignored `cache.json` per agent
 * that lets warm restarts (a fresh CI runner that just finished, a local
 * dev re-run within minutes) skip the KV round trip when the deployment
 * fingerprint hasn't moved.
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const MEMORY_DIR = resolve(PROJECT_ROOT, "agents", "memory");

const STATE_KEYS = [
  "vault_address",
  "vault_name",
  "agent_file_hash",
  "deployment_fingerprint",
  "deployment_config_path",
  "deployed_at",
  "last_run_at",
  "thesis",
  "last_thesis_update",
];

// Older runs may still hit the cache while it has a `thesis` field; we
// strip it out on the next write so it stays small. Cache TTL caps the
// staleness when we skip KV reads on a warm restart.
const CACHE_TTL_MS = 5 * 60 * 1000;

function agentMemoryDir(agentName) {
  return resolve(MEMORY_DIR, agentName);
}

function cachePath(agentName) {
  return resolve(agentMemoryDir(agentName), "cache.json");
}

function readWarmCache(agentName) {
  const p = cachePath(agentName);
  if (!existsSync(p)) return null;
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeWarmCache(agentName, payload) {
  const dir = agentMemoryDir(agentName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(cachePath(agentName), JSON.stringify(payload, null, 2) + "\n");
}

async function callTool(zgClient, name, args) {
  const result = await zgClient.callTool({ name, arguments: args });
  const text = (result?.content || [])
    .map((c) => (c.type === "text" ? c.text : JSON.stringify(c)))
    .join("\n");
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`0G MCP returned non-JSON for ${name}: ${text.slice(0, 200)}`);
  }
  if (parsed.success === false) {
    const code = parsed.error_code || "MCP_ERROR";
    throw new Error(`${code}: ${parsed.message || "unknown error"}`);
  }
  return parsed;
}

// Convert from the snake_case key shape stored on 0G to the camelCase
// shape the rest of the runner uses.
function snakeStateToCamel(values) {
  const has = (k) => values[k] !== undefined && values[k] !== null;
  const out = {};
  if (has("vault_address")) out.vaultAddress = values.vault_address;
  if (has("vault_name")) out.vaultName = values.vault_name;
  if (has("agent_file_hash")) out.agentFileHash = values.agent_file_hash;
  if (has("deployment_fingerprint")) out.deploymentFingerprint = values.deployment_fingerprint;
  if (has("deployment_config_path")) out.deploymentConfigPath = values.deployment_config_path;
  if (has("deployed_at")) out.deployedAt = values.deployed_at;
  if (has("last_run_at")) out.lastRunAt = values.last_run_at;
  if (has("thesis")) out.thesis = values.thesis;
  if (has("last_thesis_update")) out.lastThesisUpdate = values.last_thesis_update;
  return Object.keys(out).length > 0 ? out : null;
}

function camelStateToSnake(state) {
  return {
    vault_address: state.vaultAddress ?? null,
    vault_name: state.vaultName ?? null,
    agent_file_hash: state.agentFileHash ?? null,
    deployment_fingerprint: state.deploymentFingerprint ?? null,
    deployment_config_path: state.deploymentConfigPath ?? null,
    deployed_at: state.deployedAt ?? null,
    last_run_at: state.lastRunAt ?? null,
    thesis: state.thesis ?? null,
    last_thesis_update: state.lastThesisUpdate ?? null,
  };
}

export function create0gMemoryAdapter({ zgClient, agentName, networkKey, agentConfig }) {
  if (!zgClient) {
    throw new Error("create0gMemoryAdapter requires a zgClient (0g-storage-mcp client)");
  }

  return {
    mode: "0g",

    async readState({ expectedFingerprint } = {}) {
      const cache = readWarmCache(agentName);

      // Warm-cache fast path: same deployment fingerprint, fresh enough,
      // and a vault address present → trust it without hitting KV.
      if (
        cache &&
        cache.state &&
        expectedFingerprint &&
        cache.state.deploymentFingerprint === expectedFingerprint &&
        typeof cache.refreshedAt === "string" &&
        Date.now() - new Date(cache.refreshedAt).getTime() < CACHE_TTL_MS
      ) {
        return { state: cache.state, source: "cache" };
      }

      // Try KV. If the agentio public KV node is behind chain (a known
      // hackathon-node behaviour during catch-up), state_get_all returns
      // empty values and snakeStateToCamel collapses to null. In that
      // case, prefer the warm cache as a fallback so the agent doesn't
      // lose memory of prior runs while replication catches up. Same
      // applies if the KV call throws (timeout, unreachable, …).
      let kvState = null;
      let kvError = null;
      try {
        const result = await callTool(zgClient, "state_get_all", { keys: STATE_KEYS });
        kvState = snakeStateToCamel(result.values || {});
      } catch (err) {
        kvError = err;
      }

      if (kvState) {
        writeWarmCache(agentName, {
          refreshedAt: new Date().toISOString(),
          state: kvState,
        });
        return { state: kvState, source: "0g" };
      }

      if (cache && cache.state) {
        const stale = typeof cache.refreshedAt === "string"
          ? Math.round((Date.now() - new Date(cache.refreshedAt).getTime()) / 1000)
          : null;
        const reason = kvError
          ? `KV unavailable (${kvError.message || kvError})`
          : "KV returned no values yet (still syncing?)";
        console.warn(
          `[memory] ${reason}; falling back to warm cache (refreshedAt=${cache.refreshedAt}, age=${stale}s)`
        );
        return { state: cache.state, source: "cache-fallback" };
      }

      if (kvError) {
        // No cache to fall back to and KV is unreachable — surface the
        // failure so the runner can decide whether to bail or proceed
        // as a fresh deploy.
        throw kvError;
      }

      writeWarmCache(agentName, {
        refreshedAt: new Date().toISOString(),
        state: null,
      });
      return { state: null, source: "0g" };
    },

    async readRecentRunLog(limit = 5) {
      const result = await callTool(zgClient, "runlog_recent", { limit });
      const entries = (result.entries || [])
        .map((e) => e?.entry)
        .filter((e) => e && typeof e === "object")
        .filter((e) => !networkKey || e.network === networkKey || !e.network);
      // entries returned by runlog_recent are head-first (most recent first);
      // the rest of the runner displays them in chronological order.
      return entries.reverse();
    },

    async writeState(newState) {
      const snake = camelStateToSnake(newState);
      // Sequentially set so a transient failure on one key surfaces clearly
      // and doesn't corrupt the others. Each call is a separate KV write.
      for (const [key, value] of Object.entries(snake)) {
        if (value === null || value === undefined) continue;
        await callTool(zgClient, "state_set", { key, value });
      }
      writeWarmCache(agentName, {
        refreshedAt: new Date().toISOString(),
        state: newState,
      });
    },

    async appendRunLog(entry) {
      await callTool(zgClient, "log_append", { entry });
    },

    async publishAgentMetadata({ config, state, runSummary }) {
      if (!state?.vaultAddress) return;
      const recentActions = (runSummary.writeActions || [])
        .filter((a) => !a.skipped && a.justification)
        .map((a) => ({
          tool: a.tool,
          justification: a.justification,
          timestamp: runSummary.finishedAt,
          txHash: a.txHash || null,
        }));

      // Merge with existing recent actions so the web app's UX matches the
      // pre-0G behavior (rolling window of the last ~20 justified writes).
      let existingActions = [];
      try {
        const existing = await callTool(zgClient, "vault_metadata_get", {
          vault: state.vaultAddress,
        });
        if (existing?.metadata?.recentActions) {
          existingActions = existing.metadata.recentActions;
        }
      } catch {
        existingActions = [];
      }
      const allActions = [...recentActions, ...existingActions].slice(0, 20);

      const metadata = {
        isAiManaged: true,
        agentName: config.name,
        agentDescription: config.description,
        thesis: state.thesis || null,
        lastRunAt: runSummary.finishedAt,
        recentActions: allActions,
      };

      await callTool(zgClient, "vault_metadata_set", {
        vault: state.vaultAddress,
        metadata,
      });
    },
  };
}

export const __zgMemoryInternals = {
  STATE_KEYS,
  snakeStateToCamel,
  camelStateToSnake,
  cachePath,
};
