// Unit tests for the repo-editor allowlist. These are the load-bearing
// safety rails — a regression in `classifyPath` could let the
// self-improver propose edits to contracts or workflows, so the rules
// here are pinned by ~30 assertions.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  checkPath,
  classifyPath,
  normaliseRepoPath,
  listAllowRules,
  listDenyRules,
} from "./allowlist.js";

const REPO = "/repo";

// ---------------------------------------------------------------------------
// normaliseRepoPath
// ---------------------------------------------------------------------------

test("normaliseRepoPath accepts a plain relative path", () => {
  assert.equal(normaliseRepoPath("agents/foo.md", REPO), "agents/foo.md");
});

test("normaliseRepoPath rejects path traversal", () => {
  assert.equal(normaliseRepoPath("../etc/passwd", REPO), null);
  assert.equal(normaliseRepoPath("agents/../../etc/passwd", REPO), null);
});

test("normaliseRepoPath rejects empty or non-string input", () => {
  assert.equal(normaliseRepoPath("", REPO), null);
  assert.equal(normaliseRepoPath(null, REPO), null);
  assert.equal(normaliseRepoPath(42, REPO), null);
});

test("normaliseRepoPath accepts absolute paths inside the repo", () => {
  assert.equal(normaliseRepoPath("/repo/agents/foo.md", REPO), "agents/foo.md");
});

test("normaliseRepoPath rejects absolute paths outside the repo", () => {
  assert.equal(normaliseRepoPath("/etc/passwd", REPO), null);
  assert.equal(normaliseRepoPath("/somewhere/else.txt", REPO), null);
});

// ---------------------------------------------------------------------------
// Allow rules
// ---------------------------------------------------------------------------

test("classifyPath ALLOWS agent prompt markdown", () => {
  const r = classifyPath("agents/quality-matrix-manager.md");
  assert.equal(r.allowed, true);
  assert.equal(r.ruleId, "agent_prompt");
  assert.equal(r.requiresReviewKind, null);
});

test("classifyPath ALLOWS agent skill markdown", () => {
  const r = classifyPath("agents/skills/atlas-quality.md");
  assert.equal(r.allowed, true);
  assert.equal(r.ruleId, "agent_skill");
});

test("classifyPath ALLOWS mcp-servers.json", () => {
  const r = classifyPath("agents/mcp-servers.json");
  assert.equal(r.allowed, true);
  assert.equal(r.ruleId, "mcp_registry");
});

test("classifyPath ALLOWS runner JS with requiresReviewKind=runner", () => {
  for (const p of [
    "scripts/agent-runner.mjs",
    "scripts/agent-runner-confirmation.mjs",
    "scripts/agent-runner-confirmation.js",
  ]) {
    const r = classifyPath(p);
    assert.equal(r.allowed, true, p);
    assert.equal(r.requiresReviewKind, "runner", p);
  }
});

test("classifyPath ALLOWS MCP server JS with requiresReviewKind=mcp", () => {
  for (const p of [
    "apps/mcps/vault-manager/index.js",
    "apps/mcps/yfinance/index.js",
    "apps/mcps/atlas-quality/scoring/matrix.js",
    "apps/mcps/repo-editor/index.js",
  ]) {
    const r = classifyPath(p);
    assert.equal(r.allowed, true, p);
    assert.equal(r.requiresReviewKind, "mcp", p);
  }
});

test("classifyPath ALLOWS shared JS with requiresReviewKind=shared", () => {
  const r = classifyPath("apps/shared/agent-shared-memory.mjs");
  assert.equal(r.allowed, true);
  assert.equal(r.requiresReviewKind, "shared");
});

// ---------------------------------------------------------------------------
// Deny rules
// ---------------------------------------------------------------------------

test("classifyPath DENIES every Solidity source file", () => {
  for (const p of [
    "src/BasketVault.sol",
    "src/perp/Vault.sol",
    "lib/forge-std/src/Test.sol",
    "test/BasketVault.t.sol",
    "script/Deploy.s.sol",
  ]) {
    const r = classifyPath(p);
    assert.equal(r.allowed, false, p);
    assert.equal(r.effect, "deny", p);
  }
});

test("classifyPath DENIES CI workflow + composite-action files", () => {
  assert.equal(classifyPath(".github/workflows/vault-agent.yml").allowed, false);
  assert.equal(classifyPath(".github/workflows/test.yml").allowed, false);
  assert.equal(classifyPath(".github/actions/setup-snx/action.yml").allowed, false);
});

test("classifyPath DENIES generated ABIs", () => {
  assert.equal(classifyPath("apps/web/src/abi/BasketVault.ts").allowed, false);
  assert.equal(classifyPath("apps/envio/abis/BasketVault.json").allowed, false);
});

test("classifyPath DENIES deployment configs", () => {
  assert.equal(classifyPath("apps/web/src/config/sepolia-deployment.json").allowed, false);
  assert.equal(classifyPath("apps/web/src/config/fuji-deployment.json").allowed, false);
  assert.equal(classifyPath("apps/web/src/config/local-deployment.json").allowed, false);
});

test("classifyPath DENIES env and credential files", () => {
  assert.equal(classifyPath(".env").allowed, false);
  assert.equal(classifyPath(".env.local").allowed, false);
  assert.equal(classifyPath(".env.example").allowed, false);
  assert.equal(classifyPath("apps/web/.env.local").allowed, false);
  assert.equal(classifyPath("credentials.json").allowed, false);
  assert.equal(classifyPath("apps/foo/credentials.txt").allowed, false);
  assert.equal(classifyPath("test.secret.json").allowed, false);
  assert.equal(classifyPath("key.pem").allowed, false);
});

test("classifyPath DENIES governance and human-owned docs", () => {
  assert.equal(classifyPath("AGENTS.md").allowed, false);
  assert.equal(classifyPath("AGENT_DEPLOYMENT_MEMORY.md").allowed, false);
  assert.equal(classifyPath("CHANGELOG.md").allowed, false);
  assert.equal(classifyPath(".cursor/rules/changelog-updates.mdc").allowed, false);
});

test("classifyPath DENIES agent memory and metadata directories", () => {
  assert.equal(classifyPath("agents/memory/mining-manager/state.json").allowed, false);
  assert.equal(classifyPath("agents/memory/quality-matrix-manager/run-log.sepolia.jsonl").allowed, false);
  assert.equal(classifyPath("apps/web/public/agent-metadata/0xabc.json").allowed, false);
});

test("classifyPath DENIES node_modules and git internals", () => {
  assert.equal(classifyPath("node_modules/foo/index.js").allowed, false);
  assert.equal(classifyPath("apps/web/node_modules/foo/index.js").allowed, false);
  assert.equal(classifyPath(".git/HEAD").allowed, false);
  assert.equal(classifyPath("package-lock.json").allowed, false);
});

test("classifyPath default-denies any path not on the allow-list", () => {
  // README is not currently listed; default-deny applies. The PR has a
  // companion docs change so README updates land on the same human PR.
  assert.equal(classifyPath("README.md").allowed, false);
  assert.equal(classifyPath("docs/AGENTS_FRAMEWORK.md").allowed, false);
  assert.equal(classifyPath("apps/web/src/app/page.tsx").allowed, false);
});

// ---------------------------------------------------------------------------
// checkPath (the full guard used by the MCP)
// ---------------------------------------------------------------------------

test("checkPath returns a PATH_DENIED payload for an allowlist miss", () => {
  const r = checkPath("README.md", REPO);
  assert.equal(r.ok, false);
  assert.equal(r.error_code, "PATH_DENIED");
  assert.match(r.message, /no_match_default_deny/);
});

test("checkPath returns a PATH_OUT_OF_REPO payload for traversal", () => {
  const r = checkPath("../etc/passwd", REPO);
  assert.equal(r.ok, false);
  assert.equal(r.error_code, "PATH_OUT_OF_REPO");
});

test("checkPath returns ok and relPath for an allowed agent file", () => {
  const r = checkPath("/repo/agents/quality-matrix-manager.md", REPO);
  assert.equal(r.ok, true);
  assert.equal(r.relPath, "agents/quality-matrix-manager.md");
  assert.equal(r.requiresReviewKind, null);
});

test("checkPath stamps requiresReviewKind on runner/mcp paths", () => {
  assert.equal(checkPath("scripts/agent-runner.mjs", REPO).requiresReviewKind, "runner");
  assert.equal(checkPath("apps/mcps/yfinance/index.js", REPO).requiresReviewKind, "mcp");
});

// ---------------------------------------------------------------------------
// Rule enumeration helpers (used by docs / risk-officer payload)
// ---------------------------------------------------------------------------

test("listAllowRules and listDenyRules return non-empty arrays", () => {
  const allows = listAllowRules();
  const denies = listDenyRules();
  assert.ok(allows.length > 0);
  assert.ok(denies.length > 0);
  for (const a of allows) {
    assert.equal(typeof a.id, "string");
  }
  for (const d of denies) {
    assert.equal(typeof d.id, "string");
  }
});

// ---------------------------------------------------------------------------
// End-to-end against a real tmp directory (catches accidental absolute-vs-
// relative confusion between `resolve` and `relative`).
// ---------------------------------------------------------------------------

test("checkPath against a real temp repo handles symlink-free relative paths", () => {
  const tmp = mkdtempSync(join(tmpdir(), "snx-repo-editor-"));
  try {
    const r = checkPath("agents/foo.md", tmp);
    assert.equal(r.ok, true);
    assert.equal(r.relPath, "agents/foo.md");
    const denied = checkPath("agents/memory/x.json", tmp);
    assert.equal(denied.ok, false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
