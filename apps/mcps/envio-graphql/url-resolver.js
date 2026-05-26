// Pure helpers for resolving the canonical Envio HyperIndex GraphQL URL
// out of AGENT_DEPLOYMENT_MEMORY.md. Extracted so the smoke test and the
// MCP server share one implementation that can be unit-tested without
// touching the filesystem.
//
// Why parse the markdown instead of hard-coding the URL? Per
// `agents/skills/envio-graphql.md`:
//
//   "Canonical URL lives in AGENT_DEPLOYMENT_MEMORY.md — Envio HyperIndex
//   deployment row, Current URL field. Do NOT hard-code the URL in agent
//   prompts; read it from the deployment memory file so URL rotations
//   land automatically."
//
// The memory file is git-tracked. When the indexer URL rotates (e.g. a
// rename from `indexflow-prototype-2` → `-3` flipping the deployment
// slug from `caee388` to `dbe3f66`), the founder updates the row and the
// next MCP server start picks it up. No env var redeploy, no script
// edit. Env var `ENVIO_URL` is the fallback for tests / local dev when
// the memory file is unavailable.

// Matches `https://indexer.dev.hyperindex.xyz/<slug>/v1/graphql` (the
// canonical Hasura endpoint shape Envio Cloud uses for HyperIndex
// deployments) plus any future host that follows the same `/v1/graphql`
// path suffix. The path suffix is the load-bearing part — Hasura's
// GraphQL endpoint is always `/v1/graphql`, queries against
// `/v1/metadata` or `/healthz` would be malformed.
const URL_PATTERN = /https?:\/\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/v1\/graphql/g;

// Heuristic markers that identify the right row in the markdown table.
// The row's description always contains "Current URL" (a verbatim field
// per the canonical row format documented in AGENT_DEPLOYMENT_MEMORY.md
// preamble). The service-name marker survives the periodic rename
// (`indexflow-prototype-2` → `-3`) because the prefix is stable.
const ROW_MARKER_PRIMARY = "HyperIndex deployment";
const ROW_MARKER_SECONDARY = "Current URL";

/**
 * Find the canonical Envio GraphQL URL inside the deployment-memory
 * markdown. Returns the URL on success, or null when no row matches
 * (callers fall back to ENVIO_URL or throw).
 *
 * The match is line-scoped: we look for the row that contains BOTH the
 * `HyperIndex deployment` marker AND a `Current URL` field, then
 * extract the first `/v1/graphql` URL on that line. Restricting to the
 * intersection of both markers protects against:
 *   - matching the The Graph subgraph row (uses Studio, not HyperIndex),
 *   - matching the deprecation note about the old `/caee388/` URL (lives
 *     on the same row but is prefixed `Previous URL`).
 */
export function extractEnvioUrlFromMemory(markdown) {
  if (typeof markdown !== "string" || !markdown) return null;
  const lines = markdown.split(/\r?\n/);
  for (const line of lines) {
    if (!line.includes(ROW_MARKER_PRIMARY)) continue;
    if (!line.includes(ROW_MARKER_SECONDARY)) continue;
    // Slice at the `Current URL` anchor so we don't accidentally grab
    // the `Previous URL` mentioned later in the same row.
    const currentIdx = line.indexOf(ROW_MARKER_SECONDARY);
    const previousIdx = line.indexOf("Previous URL");
    const end =
      previousIdx > currentIdx ? previousIdx : line.length;
    const slice = line.slice(currentIdx, end);
    const match = slice.match(URL_PATTERN);
    if (match && match.length > 0) return match[0];
  }
  return null;
}

/**
 * Resolve the canonical URL with the documented precedence:
 *   1. explicit `ENVIO_URL` env var (wins so tests + local dev can
 *      point at a fixture without editing the memory file),
 *   2. parsed `Current URL` from AGENT_DEPLOYMENT_MEMORY.md,
 *   3. null (caller must throw with an actionable error).
 *
 * `readMemoryFile` is injected so the MCP server can use real `readFileSync`
 * while the unit test can stub it with a fixture string.
 */
export function resolveEnvioUrl({ env = process.env, readMemoryFile } = {}) {
  if (env.ENVIO_URL && env.ENVIO_URL.trim()) {
    return { url: env.ENVIO_URL.trim(), source: "env:ENVIO_URL" };
  }
  if (typeof readMemoryFile === "function") {
    let memoryText;
    try {
      memoryText = readMemoryFile();
    } catch {
      memoryText = null;
    }
    if (memoryText) {
      const parsed = extractEnvioUrlFromMemory(memoryText);
      if (parsed) {
        return { url: parsed, source: "AGENT_DEPLOYMENT_MEMORY.md" };
      }
    }
  }
  return { url: null, source: "unresolved" };
}
