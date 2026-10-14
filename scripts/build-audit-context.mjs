#!/usr/bin/env node

// Builds `.agent-audit/audit-context.json` from a git diff (PR mode) or the
// full `src/**/*.sol` tree (full-repo mode) before `security-auditor` runs.
// Invoked by `.github/workflows/security-audit.yml`.
//
// The security-auditor agent only sees Solidity source through this file —
// `read_repo_file` in repo-editor-mcp denies all `.sol` paths by design
// (apps/mcps/repo-editor/allowlist.js), so this trusted CI script is the
// sole path by which contract code reaches the LLM.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(process.env.PROJECT_ROOT || resolve(__dirname, ".."));
const OUT_DIR = resolve(PROJECT_ROOT, ".agent-audit");
const OUT_PATH = resolve(OUT_DIR, "audit-context.json");

const MAX_FILE_BYTES = 60_000; // keep individual file dumps bounded for the LLM context
const MAX_FILES = 40; // cap total files included (diff or full-repo mode)
const MAX_TOTAL_BYTES = 400_000; // combined content budget across all files in one context

function git(args) {
  return execFileSync("git", args, { cwd: PROJECT_ROOT, encoding: "utf8" }).trim();
}

function readFileTruncated(relPath) {
  const abs = resolve(PROJECT_ROOT, relPath);
  if (!existsSync(abs)) return null;
  const raw = readFileSync(abs, "utf8");
  if (raw.length <= MAX_FILE_BYTES) return { content: raw, truncated: false };
  return { content: raw.slice(0, MAX_FILE_BYTES), truncated: true };
}

function buildFileEntries(relPaths) {
  let budgetRemaining = MAX_TOTAL_BYTES;
  const entries = [];
  for (const relPath of relPaths.slice(0, MAX_FILES)) {
    if (budgetRemaining <= 0) {
      entries.push({ path: relPath, exists: true, content: null, truncated: true, skipped: "total_budget_exceeded" });
      continue;
    }
    const info = readFileTruncated(relPath);
    const content = info?.content ?? null;
    if (content !== null && content.length > budgetRemaining) {
      entries.push({
        path: relPath,
        exists: true,
        content: content.slice(0, budgetRemaining),
        truncated: true,
      });
      budgetRemaining = 0;
      continue;
    }
    budgetRemaining -= content?.length ?? 0;
    entries.push({
      path: relPath,
      exists: info !== null,
      content,
      truncated: info?.truncated ?? false,
    });
  }
  return entries;
}

export function buildDiffContext({ baseRef, headRef }) {
  const range = `${baseRef}...${headRef}`;
  const changedFiles = git(["diff", "--name-only", range, "--", "*.sol"])
    .split("\n")
    .filter(Boolean);
  let diff = "";
  try {
    diff = git(["diff", range, "--", "*.sol"]);
  } catch (err) {
    diff = `(failed to compute diff: ${err.message})`;
  }
  return {
    mode: "diff",
    baseRef,
    headRef,
    changedFiles,
    diff,
    files: buildFileEntries(changedFiles),
  };
}

export function buildFullRepoContext() {
  let allFiles = [];
  try {
    allFiles = execFileSync("find", ["src", "-name", "*.sol", "-type", "f"], {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean)
      .sort();
  } catch (err) {
    throw new Error(`find src -name '*.sol' failed: ${err.message}`);
  }
  return {
    mode: "full_repo",
    changedFiles: allFiles,
    diff: null,
    files: buildFileEntries(allFiles),
  };
}

const isCli =
  typeof process !== "undefined" &&
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  const mode = process.env.AUDIT_MODE === "full_repo" ? "full_repo" : "diff";

  let context;
  if (mode === "full_repo") {
    context = buildFullRepoContext();
  } else {
    const baseRef = process.env.BASE_REF;
    const headRef = process.env.HEAD_REF || "HEAD";
    if (!baseRef) {
      console.error("AUDIT_MODE=diff requires BASE_REF (and optionally HEAD_REF) env vars");
      process.exit(2);
    }
    context = buildDiffContext({ baseRef, headRef });
  }

  if (process.env.PR_NUMBER) {
    context.pr = {
      number: Number(process.env.PR_NUMBER),
      title: process.env.PR_TITLE || "",
      url: process.env.PR_URL || null,
    };
  }

  if (context.changedFiles.length === 0) {
    console.log("No changed .sol files found — writing empty audit context.");
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(context, null, 2));
  console.log(`Wrote audit context (${context.mode}, ${context.changedFiles.length} file(s)) to ${OUT_PATH}`);
}
