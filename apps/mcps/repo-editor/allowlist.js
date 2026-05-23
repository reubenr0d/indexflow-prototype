// Allowlist + deny-list for the repo-editor MCP server. The `self-improver`
// meta-agent uses repo-editor's `read_repo_file` and `propose_file_*` tools
// to draft PRs that refine the vault agents from accumulated memory. The
// rules here are the single source of truth for which paths the agent may
// touch — both the MCP itself AND the PR-opener
// (`scripts/apply-self-improvement-proposals.mjs`) re-check them on every
// proposal so a regression in one layer can't widen the blast radius.
//
// Design rules (see plan):
//   - DENY takes precedence over ALLOW.
//   - Contracts, CI workflows, generated ABIs, deployment configs, secrets,
//     governance docs, and the runner-owned memory tree are ALWAYS denied.
//   - Allowed paths fall into three buckets: prompt-level (`agents/*.md`,
//     `agents/skills/*.md`, `agents/mcp-servers.json`), runner JS, and MCP
//     server JS. The latter two are flagged with `requiresReviewKind` so
//     the PR description can surface them prominently.
//
// All paths are repository-root-relative (no leading slash).

import { resolve, relative, normalize, isAbsolute } from "node:path";

export const PROPOSAL_MANIFEST_REL = ".agent-self-improvement/proposed-edits.json";

// Order matters: each rule is tried in declaration order until one wins.
// `effect: "deny"` short-circuits; `effect: "allow"` returns the rule's
// metadata (including the optional `requiresReviewKind`).
//
// `match` is a function (path) => boolean to keep the rules expressive
// without pulling in a glob dependency. All inputs are normalized
// repo-relative paths with forward slashes.

const RULES = [
  // -------------------------------------------------------------- DENY ----
  // Anywhere outside the repo (caught by the path resolver below — this is
  // a belt-and-braces deny that never matches a normalised relative path).
  { effect: "deny", id: "outside_repo", match: (p) => p.startsWith("..") || isAbsolute(p) },

  // Smart contracts (Solidity sources, libs, deployment scripts, tests).
  // Changes here require Foundry + audit review and never come from a
  // memory-driven prompt edit.
  { effect: "deny", id: "solidity_sources", match: (p) => p.endsWith(".sol") },
  { effect: "deny", id: "contracts_root_src", match: (p) => p === "src" || p.startsWith("src/") },
  { effect: "deny", id: "contracts_lib", match: (p) => p === "lib" || p.startsWith("lib/") },
  { effect: "deny", id: "contracts_script", match: (p) => p === "script" || p.startsWith("script/") },
  { effect: "deny", id: "contracts_test", match: (p) => p === "test" || p.startsWith("test/") },
  { effect: "deny", id: "contracts_build", match: (p) => p.startsWith("out/") || p.startsWith("cache/") || p.startsWith("broadcast/") },

  // CI workflows — the meta-loop must not be able to rewrite the workflow
  // that gates it. Action composites included.
  { effect: "deny", id: "github_workflows", match: (p) => p.startsWith(".github/workflows/") },
  { effect: "deny", id: "github_actions", match: (p) => p.startsWith(".github/actions/") },

  // Generated ABIs (regenerated from Foundry artifacts; see AGENTS.md).
  { effect: "deny", id: "web_abis", match: (p) => p.startsWith("apps/web/src/abi/") },
  { effect: "deny", id: "envio_abis", match: (p) => p.startsWith("apps/envio/abis/") },

  // Deployment config (on-chain addresses; touched only by the deployer).
  { effect: "deny", id: "web_deployment_config", match: (p) => /^apps\/web\/src\/config\/.*-deployment\.json$/.test(p) },

  // Secrets, credentials, and environment files. The `.env.example` files
  // ARE allowed under `agents_skill` patterns below if and only if they
  // also match an allow rule — but in practice they don't, so envs stay
  // entirely off-limits.
  { effect: "deny", id: "env_files", match: (p) => /(^|\/)\.env(\..*)?$/.test(p) },
  { effect: "deny", id: "credentials", match: (p) => /(^|\/)credentials[^/]*$/i.test(p) },
  { effect: "deny", id: "secret_files", match: (p) => /\.secret(\..*)?$/i.test(p) },
  { effect: "deny", id: "private_keys", match: (p) => /\.(pem|key|p12|jks)$/i.test(p) },

  // Governance documents that humans own.
  { effect: "deny", id: "governance_docs", match: (p) =>
    p === "AGENTS.md" ||
    p === "AGENT_DEPLOYMENT_MEMORY.md" ||
    p.startsWith(".cursor/rules/") ||
    p === "CHANGELOG.md" /* CHANGELOG entries are added by humans on the
       same PR they're documenting — see .cursor/rules/changelog-updates */ },

  // Agent memory and per-vault metadata are owned by the runner; the
  // meta-loop is meant to refine the STRATEGY that produces them, not
  // re-write the data itself.
  { effect: "deny", id: "agent_memory", match: (p) => p.startsWith("agents/memory/") },
  { effect: "deny", id: "agent_metadata", match: (p) => p.startsWith("apps/web/public/agent-metadata/") },

  // node_modules / git-internal / lockfiles.
  { effect: "deny", id: "node_modules", match: (p) => p.startsWith("node_modules/") || p.includes("/node_modules/") },
  { effect: "deny", id: "git_internal", match: (p) => p.startsWith(".git/") },
  { effect: "deny", id: "lockfiles", match: (p) => p === "package-lock.json" || p === "yarn.lock" || p.endsWith("/package-lock.json") || p.endsWith("/yarn.lock") },

  // The runner's own session debug log (not strategy).
  { effect: "deny", id: "agent_debug_log", match: (p) => p === "scripts/agent-debug-log.jsonl" },

  // ------------------------------------------------------------- ALLOW ----
  // Agent prompts (system prompt body + YAML frontmatter).
  {
    effect: "allow",
    id: "agent_prompt",
    requiresReviewKind: null,
    match: (p) => /^agents\/[^/]+\.md$/.test(p),
  },
  // Agent skills (reusable tool/API references).
  {
    effect: "allow",
    id: "agent_skill",
    requiresReviewKind: null,
    match: (p) => /^agents\/skills\/[^/]+\.md$/.test(p),
  },
  // MCP server registry (the meta-loop may add a passthrough env var or
  // register a new server, but never delete an existing entry — that
  // semantic is enforced in the PR-opener via a content diff check).
  {
    effect: "allow",
    id: "mcp_registry",
    requiresReviewKind: null,
    match: (p) => p === "agents/mcp-servers.json",
  },
  // Runner JS and adjacent helpers / tests. Flagged for elevated review
  // because runner changes affect every agent. The deny rule above
  // explicitly excludes `scripts/agent-debug-log.jsonl`.
  {
    effect: "allow",
    id: "runner_js",
    requiresReviewKind: "runner",
    match: (p) => /^scripts\/agent-runner(-[^/]+)?\.(mjs|js)$/.test(p),
  },
  // MCP server source. Flagged for elevated review because MCP changes
  // affect on-chain behaviour.
  {
    effect: "allow",
    id: "mcp_source",
    requiresReviewKind: "mcp",
    match: (p) => /^apps\/mcps\/[^/]+\/.*\.(mjs|js)$/.test(p),
  },
  // Shared JS used by agents + MCPs (e.g. apps/shared/agent-shared-memory.mjs).
  {
    effect: "allow",
    id: "shared_js",
    requiresReviewKind: "shared",
    match: (p) => /^apps\/shared\/.*\.(mjs|js)$/.test(p),
  },
];

// Public: normalise any user-supplied path to a repo-relative POSIX string.
// Returns null when the input escapes the repo or contains a path-traversal
// pattern that can't be safely resolved.
export function normaliseRepoPath(inputPath, projectRoot) {
  if (typeof inputPath !== "string" || !inputPath.trim()) return null;
  if (typeof projectRoot !== "string" || !projectRoot.trim()) return null;
  const resolved = isAbsolute(inputPath) ? resolve(inputPath) : resolve(projectRoot, inputPath);
  const rel = relative(projectRoot, resolved);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
  return rel.split("\\").join("/");
}

// Public: classify a normalised repo-relative path against the rule list.
// Returns `{ allowed, ruleId, effect, requiresReviewKind }`.
export function classifyPath(relPath) {
  if (typeof relPath !== "string" || !relPath) {
    return { allowed: false, ruleId: "invalid_input", effect: "deny", requiresReviewKind: null };
  }
  const normalised = normalize(relPath).split("\\").join("/");
  for (const rule of RULES) {
    if (!rule.match(normalised)) continue;
    return {
      allowed: rule.effect === "allow",
      ruleId: rule.id,
      effect: rule.effect,
      requiresReviewKind: rule.requiresReviewKind || null,
    };
  }
  return {
    allowed: false,
    ruleId: "no_match_default_deny",
    effect: "deny",
    requiresReviewKind: null,
  };
}

// Public: full check that takes the agent's raw path + a projectRoot and
// returns either `{ ok: true, relPath, requiresReviewKind }` for use by
// the MCP / applier, or `{ ok: false, error_code, message }` for the
// MCP's tool-error response payload.
export function checkPath(inputPath, projectRoot) {
  const rel = normaliseRepoPath(inputPath, projectRoot);
  if (!rel) {
    return {
      ok: false,
      error_code: "PATH_OUT_OF_REPO",
      message: `Refused: ${JSON.stringify(inputPath)} resolves outside the repository root (${projectRoot}).`,
    };
  }
  const classification = classifyPath(rel);
  if (!classification.allowed) {
    return {
      ok: false,
      error_code: "PATH_DENIED",
      message: `Refused by allowlist rule "${classification.ruleId}": ${rel} is not editable by the self-improver. See apps/mcps/repo-editor/allowlist.js for the full deny-list.`,
      ruleId: classification.ruleId,
      relPath: rel,
    };
  }
  return {
    ok: true,
    relPath: rel,
    ruleId: classification.ruleId,
    requiresReviewKind: classification.requiresReviewKind,
  };
}

// Public: enumerate the allow-list for debugging / docs. Not used by the
// MCP itself but handy for `scripts/run-self-improvement-risk-officer.mjs`.
export function listAllowRules() {
  return RULES.filter((r) => r.effect === "allow").map((r) => ({
    id: r.id,
    requiresReviewKind: r.requiresReviewKind || null,
  }));
}

export function listDenyRules() {
  return RULES.filter((r) => r.effect === "deny").map((r) => ({ id: r.id }));
}
