// Shared, on-disk memory used by every trading agent + their MCP servers.
//
// Two stores live under `agents/memory/shared/`:
//
//   - news-cache.<agentName>.json — TTL'd Yahoo news headlines. Each agent
//     writes its own file so concurrent artifact uploads in CI can never
//     overwrite another agent's cache content. Reads union all files in the
//     directory and pick the most-recent fetch per symbol within the TTL,
//     so a headline pulled by one agent in tick N is reusable by every
//     agent in tick N+1 once CI commits the shared dir back to main.
//   - recently-closed.<vaultAddress>.json — TTL'd "do not re-open" list of
//     (vault, assetId) pairs the rank-swap / pnl_band / LLM-judged auto-exit
//     pass closed within `CHURN_GUARD_WINDOW_MS`. Keyed per-vault so each
//     agent only ever writes its own file (no merge collisions). Consulted
//     by `plan_open_position` to short-circuit ticker thrashing.
//
// Both files are committed back to main by the vault-agent CI commit-results
// job (see `.github/workflows/vault-agent.yml`); the `shared/` directory is
// preserved across the pre-extract cleanup so cache state survives the
// fresh-checkout that every CI matrix job starts from.

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  renameSync,
} from "node:fs";
import { resolve, dirname } from "node:path";

const NEWS_CACHE_TTL_MS_DEFAULT = 30 * 60 * 1000; // 30 minutes
export const CHURN_GUARD_WINDOW_MS = 4 * 60 * 60 * 1000; // 4 hours

function safeFilenameFragment(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveProjectRoot(projectRoot) {
  return projectRoot || process.env.PROJECT_ROOT || process.cwd();
}

export function sharedMemoryDir(projectRoot) {
  return resolve(resolveProjectRoot(projectRoot), "agents", "memory", "shared");
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

// Atomic JSON write: write to a sibling .tmp and rename. Prevents partial
// files when the process is killed mid-write (e.g. CI runner timeout).
function writeJsonAtomic(filePath, value) {
  ensureDir(dirname(filePath));
  const serialized = JSON.stringify(value, null, 2) + "\n";
  const tmp = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmp, serialized);
  renameSync(tmp, filePath);
}

function readJsonSafe(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// News cache (per-agent JSON file)
// ---------------------------------------------------------------------------

function newsCachePath(projectRoot, agentName) {
  const slug = safeFilenameFragment(agentName) || "default";
  return resolve(sharedMemoryDir(projectRoot), `news-cache.${slug}.json`);
}

function listNewsCacheFiles(projectRoot) {
  const dir = sharedMemoryDir(projectRoot);
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((name) => name.startsWith("news-cache.") && name.endsWith(".json"))
      .map((name) => resolve(dir, name));
  } catch {
    return [];
  }
}

// Read every news-cache.*.json under `shared/` and return a map of
// `SYMBOL -> { fetchedAt, headlines, sourceAgent }` keeping the freshest
// entry per symbol within `ttlMs`.
export function readNewsCacheUnion({ projectRoot, ttlMs } = {}) {
  const ttl = Number.isFinite(ttlMs) ? ttlMs : NEWS_CACHE_TTL_MS_DEFAULT;
  const now = Date.now();
  const merged = new Map();
  for (const file of listNewsCacheFiles(projectRoot)) {
    const data = readJsonSafe(file);
    if (!data || typeof data !== "object") continue;
    const entries = data.entries && typeof data.entries === "object" ? data.entries : {};
    const sourceAgent = data.agentName || null;
    for (const [symbol, entry] of Object.entries(entries)) {
      if (!entry || typeof entry !== "object") continue;
      const fetchedAt = Date.parse(entry.fetchedAt || "");
      if (!Number.isFinite(fetchedAt)) continue;
      if (now - fetchedAt > ttl) continue;
      const key = String(symbol).toUpperCase();
      const existing = merged.get(key);
      if (!existing || fetchedAt > existing.fetchedAtMs) {
        merged.set(key, {
          fetchedAt: entry.fetchedAt,
          fetchedAtMs: fetchedAt,
          headlines: Array.isArray(entry.headlines) ? entry.headlines : [],
          sourceAgent: entry.sourceAgent || sourceAgent || null,
        });
      }
    }
  }
  return merged;
}

// Returns the cached headlines for a single symbol, or null on miss.
export function getCachedNews({ symbol, projectRoot, ttlMs } = {}) {
  if (!symbol) return null;
  const merged = readNewsCacheUnion({ projectRoot, ttlMs });
  const hit = merged.get(String(symbol).toUpperCase());
  if (!hit) return null;
  return {
    fetchedAt: hit.fetchedAt,
    headlines: hit.headlines,
    sourceAgent: hit.sourceAgent,
  };
}

// Persist a batch of `{symbol -> headlines}` for the current agent. Reads the
// agent's existing cache file, overlays the new entries, and writes back
// atomically. Old per-symbol entries that have aged past `ttlMs` are dropped
// on write so the file does not grow unboundedly.
export function writeNewsCache({
  agentName,
  entries,
  projectRoot,
  ttlMs,
  now,
} = {}) {
  if (!agentName) return { written: 0 };
  if (!entries || typeof entries !== "object") return { written: 0 };
  const ttl = Number.isFinite(ttlMs) ? ttlMs : NEWS_CACHE_TTL_MS_DEFAULT;
  const nowMs = Number.isFinite(now) ? now : Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const filePath = newsCachePath(projectRoot, agentName);
  const existing = readJsonSafe(filePath) || { agentName, entries: {} };
  const updated = { agentName, updatedAt: nowIso, entries: {} };

  // Preserve in-TTL entries from the existing file.
  if (existing.entries && typeof existing.entries === "object") {
    for (const [symbol, entry] of Object.entries(existing.entries)) {
      if (!entry) continue;
      const fetchedAtMs = Date.parse(entry.fetchedAt || "");
      if (!Number.isFinite(fetchedAtMs)) continue;
      if (nowMs - fetchedAtMs > ttl) continue;
      updated.entries[String(symbol).toUpperCase()] = entry;
    }
  }

  // Apply the new entries.
  let written = 0;
  for (const [symbol, headlines] of Object.entries(entries)) {
    if (!Array.isArray(headlines)) continue;
    updated.entries[String(symbol).toUpperCase()] = {
      fetchedAt: nowIso,
      headlines,
      sourceAgent: agentName,
    };
    written += 1;
  }

  writeJsonAtomic(filePath, updated);
  return { written, path: filePath };
}

// ---------------------------------------------------------------------------
// Recently-closed positions (per-vault JSON file)
// ---------------------------------------------------------------------------

function recentlyClosedPath(projectRoot, vault) {
  const slug = safeFilenameFragment(vault) || "unknown-vault";
  return resolve(sharedMemoryDir(projectRoot), `recently-closed.${slug}.json`);
}

export function readRecentlyClosed({ vault, projectRoot, windowMs, now } = {}) {
  if (!vault) return new Map();
  const win = Number.isFinite(windowMs) ? windowMs : CHURN_GUARD_WINDOW_MS;
  const nowMs = Number.isFinite(now) ? now : Date.now();
  const filePath = recentlyClosedPath(projectRoot, vault);
  const data = readJsonSafe(filePath);
  const map = new Map();
  if (!data || typeof data !== "object") return map;
  const closures = data.closures && typeof data.closures === "object" ? data.closures : {};
  for (const [assetId, closure] of Object.entries(closures)) {
    if (!closure || typeof closure !== "object") continue;
    const closedAtMs = Date.parse(closure.closedAt || "");
    if (!Number.isFinite(closedAtMs)) continue;
    if (nowMs - closedAtMs > win) continue;
    map.set(String(assetId).toLowerCase(), {
      ticker: closure.ticker || null,
      closedAt: closure.closedAt,
      closedReason: closure.closedReason || null,
      isLong: typeof closure.isLong === "boolean" ? closure.isLong : null,
    });
  }
  return map;
}

// Returns { inCooldown, cooldownEndsAt, closedAt, closedReason, ticker }
// or { inCooldown: false } when the asset is not in the recently-closed set.
export function checkChurnGuard({
  vault,
  assetId,
  projectRoot,
  windowMs,
  now,
} = {}) {
  if (!vault || !assetId) return { inCooldown: false };
  const win = Number.isFinite(windowMs) ? windowMs : CHURN_GUARD_WINDOW_MS;
  const nowMs = Number.isFinite(now) ? now : Date.now();
  const map = readRecentlyClosed({ vault, projectRoot, windowMs: win, now: nowMs });
  const hit = map.get(String(assetId).toLowerCase());
  if (!hit) return { inCooldown: false };
  const closedAtMs = Date.parse(hit.closedAt || "");
  if (!Number.isFinite(closedAtMs)) return { inCooldown: false };
  const cooldownEndsAtMs = closedAtMs + win;
  return {
    inCooldown: true,
    closedAt: hit.closedAt,
    closedAtMs,
    cooldownEndsAt: new Date(cooldownEndsAtMs).toISOString(),
    cooldownEndsAtMs,
    closedReason: hit.closedReason,
    ticker: hit.ticker,
    isLong: hit.isLong,
  };
}

// Append (or overlay) a closure event. Atomic write keeps the per-vault file
// internally consistent across the runner + auto-exit pass + LLM-driven
// closes all calling this within the same run.
export function recordRecentlyClosed({
  vault,
  assetId,
  ticker,
  closedReason,
  isLong,
  projectRoot,
  now,
  windowMs,
} = {}) {
  if (!vault || !assetId) return null;
  const win = Number.isFinite(windowMs) ? windowMs : CHURN_GUARD_WINDOW_MS;
  const nowMs = Number.isFinite(now) ? now : Date.now();
  const closedAt = new Date(nowMs).toISOString();
  const filePath = recentlyClosedPath(projectRoot, vault);
  const existing = readJsonSafe(filePath) || { vault, closures: {} };
  const updated = { vault, updatedAt: closedAt, closures: {} };

  if (existing.closures && typeof existing.closures === "object") {
    for (const [oldId, closure] of Object.entries(existing.closures)) {
      if (!closure) continue;
      const closedAtMs = Date.parse(closure.closedAt || "");
      if (!Number.isFinite(closedAtMs)) continue;
      if (nowMs - closedAtMs > win) continue;
      updated.closures[String(oldId).toLowerCase()] = closure;
    }
  }

  updated.closures[String(assetId).toLowerCase()] = {
    ticker: ticker || null,
    isLong: typeof isLong === "boolean" ? isLong : null,
    closedAt,
    closedReason: closedReason || null,
  };

  writeJsonAtomic(filePath, updated);
  return { closedAt, path: filePath };
}
