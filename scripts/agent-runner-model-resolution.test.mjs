// Unit tests for `resolveAgentModel` in scripts/agent-runner.mjs.
// Pure resolver — no `process.env` mutation, no IO. Pin the precedence
// rules so a future refactor can't silently re-route trading agents
// onto the wrong model.

import { test } from "node:test";
import { strict as assert } from "node:assert";

import { resolveAgentModel } from "./agent-runner.mjs";

test("resolveAgentModel: frontmatter.model wins over every env var", () => {
  const r = resolveAgentModel({
    agentName: "issue-implementer",
    frontmatter: { model: "gpt-5-codex" },
    env: {
      LLM_MODEL_ISSUE_IMPLEMENTER: "claude-x",
      LLM_MODEL: "gpt-4o",
    },
  });
  assert.equal(r.model, "gpt-5-codex");
  assert.equal(r.source, "frontmatter");
});

test("resolveAgentModel: LLM_MODEL_<AGENT> wins when frontmatter is silent", () => {
  const r = resolveAgentModel({
    agentName: "self-improver-issues",
    frontmatter: {},
    env: {
      LLM_MODEL_SELF_IMPROVER_ISSUES: "gpt-5-codex",
      LLM_MODEL: "gpt-4o",
    },
  });
  assert.equal(r.model, "gpt-5-codex");
  assert.equal(r.source, "env-per-agent");
  assert.equal(r.envKey, "LLM_MODEL_SELF_IMPROVER_ISSUES");
});

test("resolveAgentModel: agent name is upper-snake-cased into the env key (hyphens → underscores)", () => {
  const r = resolveAgentModel({
    agentName: "quality-matrix-manager",
    frontmatter: {},
    env: { LLM_MODEL_QUALITY_MATRIX_MANAGER: "gpt-4o-mini" },
  });
  assert.equal(r.model, "gpt-4o-mini");
  assert.equal(r.source, "env-per-agent");
  assert.equal(r.envKey, "LLM_MODEL_QUALITY_MATRIX_MANAGER");
});

test("resolveAgentModel: falls back to LLM_MODEL when frontmatter is silent AND no per-agent env", () => {
  const r = resolveAgentModel({
    agentName: "mining-manager",
    frontmatter: {},
    env: { LLM_MODEL: "gpt-4o" },
  });
  assert.equal(r.model, "gpt-4o");
  assert.equal(r.source, "env-global");
});

test("resolveAgentModel: falls back to gpt-4o default when nothing else is set", () => {
  const r = resolveAgentModel({
    agentName: "mining-manager",
    frontmatter: {},
    env: {},
  });
  assert.equal(r.model, "gpt-4o");
  assert.equal(r.source, "default");
});

test("resolveAgentModel: empty-string frontmatter.model is treated as unset (falls through to env)", () => {
  const r = resolveAgentModel({
    agentName: "mining-manager",
    frontmatter: { model: "   " },
    env: { LLM_MODEL: "gpt-4o" },
  });
  assert.equal(r.model, "gpt-4o");
  assert.equal(r.source, "env-global");
});

test("resolveAgentModel: empty-string per-agent env is treated as unset (falls through to global)", () => {
  const r = resolveAgentModel({
    agentName: "issue-implementer",
    frontmatter: {},
    env: { LLM_MODEL_ISSUE_IMPLEMENTER: "", LLM_MODEL: "gpt-4o" },
  });
  assert.equal(r.model, "gpt-4o");
  assert.equal(r.source, "env-global");
});

test("resolveAgentModel: missing agentName still resolves via global env", () => {
  const r = resolveAgentModel({ frontmatter: {}, env: { LLM_MODEL: "gpt-4o" } });
  assert.equal(r.model, "gpt-4o");
  assert.equal(r.source, "env-global");
});

test("resolveAgentModel: trims surrounding whitespace from accepted values", () => {
  const r = resolveAgentModel({
    agentName: "issue-implementer",
    frontmatter: { model: "  gpt-5-codex  " },
  });
  assert.equal(r.model, "gpt-5-codex");
  assert.equal(r.source, "frontmatter");
});

// ---------------------------------------------------------------------------
// Drift guard: the two meta-agents whose entire job is exact-substring
// code edits MUST pin `gpt-5-codex` in their frontmatter. If a future
// edit removes the pin, this test catches it before CI burns a run on
// the wrong model.
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

function readFrontmatterModel(relPath) {
  const raw = readFileSync(resolve(PROJECT_ROOT, relPath), "utf8");
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  const m = fm[1].match(/^model:\s*(.*)$/m);
  return m ? m[1].trim() : null;
}

test("issue-implementer agent frontmatter pins model: gpt-5-codex", () => {
  assert.equal(readFrontmatterModel("agents/issue-implementer.md"), "gpt-5-codex");
});

test("self-improver-issues agent frontmatter pins model: gpt-5-codex", () => {
  assert.equal(readFrontmatterModel("agents/self-improver-issues.md"), "gpt-5-codex");
});
