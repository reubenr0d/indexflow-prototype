#!/usr/bin/env node

// MCP server for repo-editing meta-agents (`issue-implementer`,
// `self-improver-issues`). Read-only against the
// whole repo (gated by `allowlist.js`), write-only into a proposal
// manifest at `.agent-self-improvement/proposed-edits.json`. The on-disk
// repo is never mutated by this server — that happens in
// `scripts/apply-self-improvement-proposals.mjs` AFTER the risk-officer
// has approved the manifest.
//
// Tools exposed (see plan, Layer B' + Layer F-MCP):
//   - get_self_improvement_signals()
//   - get_issue_context()                                              ← issue-implementer
//   - list_run_log({ agent, network, limit })
//   - read_repo_file({ path, sliceStart?, sliceLength? })
//   - propose_file_edit({ path, replacements[], justification, convictionWeight? })
//   - propose_file_create({ path, contents, justification, convictionWeight? })
//   - propose_file_rename({ path, newPath, justification, convictionWeight? })
//   - summarize_proposals()
//   - propose_issue({ title, body, category, justification, convictionWeight? })   ← issues channel
//   - list_open_issues({ label?, search?, limit? })                                 ← issues channel
//
// Environment:
//   PROJECT_ROOT  - mandatory; set by `scripts/agent-runner.mjs`
//                    (`spawnMcpClient` sets it before spawning every MCP
//                    server). Defaults to `process.cwd()` for local runs.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  checkPath,
  PROPOSAL_MANIFEST_REL,
  listAllowRules,
  listDenyRules,
} from "./allowlist.js";
import {
  emptyManifest,
  addReplaceEdit,
  addCreateEdit,
  addRenameEdit,
  listTouchedPaths,
  listTouchedAgents,
} from "./proposal-manifest.js";
import {
  emptyIssueManifest,
  addIssue,
  listIssueIds,
  listIssueCategories,
  CATEGORY_ENUM,
  MAX_TITLE_CHARS,
  MAX_BODY_CHARS,
} from "./issue-manifest.js";
import { previewReplaceEdit, replayPriorEdits } from "./edit-replay.js";

const PROJECT_ROOT = resolve(process.env.PROJECT_ROOT || process.cwd());
const MANIFEST_PATH = resolve(PROJECT_ROOT, PROPOSAL_MANIFEST_REL);
const ISSUE_MANIFEST_REL = ".agent-self-improvement/proposed-issues.json";
const ISSUE_MANIFEST_PATH = resolve(PROJECT_ROOT, ISSUE_MANIFEST_REL);
const ISSUE_CONTEXT_REL = ".agent-self-improvement/issue-context.json";
const ISSUE_CONTEXT_PATH = resolve(PROJECT_ROOT, ISSUE_CONTEXT_REL);
const SIGNAL_DETECTOR_SCRIPT = resolve(PROJECT_ROOT, "scripts", "detect-self-improvement-signal.mjs");
const MAX_FILE_READ_BYTES = 256 * 1024; // 256 KB is more than enough for any agent .md or runner section
const MAX_RUN_LOG_LIMIT = 200;
const MAX_GH_ISSUE_LIST_LIMIT = 50;

// ---------------------------------------------------------------------------
// MCP-friendly response helpers (mirror the yfinance MCP pattern)
// ---------------------------------------------------------------------------

function toolText(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

function toolError(error_code, message, extra = {}) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ success: false, error_code, message, ...extra }, null, 2),
      },
    ],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// Manifest IO
// ---------------------------------------------------------------------------

function readManifest() {
  if (!existsSync(MANIFEST_PATH)) return emptyManifest();
  try {
    const raw = readFileSync(MANIFEST_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.edits)) {
      return emptyManifest();
    }
    return parsed;
  } catch {
    return emptyManifest();
  }
}

function writeManifest(manifest) {
  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
}

function readIssueManifest() {
  if (!existsSync(ISSUE_MANIFEST_PATH)) return emptyIssueManifest();
  try {
    const raw = readFileSync(ISSUE_MANIFEST_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.issues)) {
      return emptyIssueManifest();
    }
    return parsed;
  } catch {
    return emptyIssueManifest();
  }
}

function writeIssueManifest(manifest) {
  mkdirSync(dirname(ISSUE_MANIFEST_PATH), { recursive: true });
  writeFileSync(ISSUE_MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
}

// Shell out to `gh issue list` for the agent's dedup awareness. Returns
// `{ available: true, issues: [...] }` on success, or
// `{ available: false, error_code: "GH_NOT_AVAILABLE", message }` when
// `gh` is missing, unauthenticated, or rate-limited. Never throws.
function ghIssueList({ label, search, state = "open", limit = 30 } = {}) {
  const args = [
    "issue",
    "list",
    "--state",
    state,
    "--json",
    "number,title,labels,createdAt,url",
    "--limit",
    String(Math.max(1, Math.min(MAX_GH_ISSUE_LIST_LIMIT, Number(limit) || 30))),
  ];
  if (label) args.push("--label", String(label));
  if (search) args.push("--search", String(search));
  const result = spawnSync("gh", args, {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    timeout: 20_000,
    env: { ...process.env },
  });
  if (result.error) {
    return { available: false, error_code: "GH_NOT_AVAILABLE", message: result.error.message };
  }
  if (result.status !== 0) {
    return {
      available: false,
      error_code: "GH_NOT_AVAILABLE",
      message: `gh exit ${result.status}: ${(result.stderr || "").slice(0, 400)}`,
    };
  }
  try {
    const parsed = JSON.parse(result.stdout || "[]");
    return { available: true, issues: Array.isArray(parsed) ? parsed : [] };
  } catch (err) {
    return { available: false, error_code: "GH_PARSE_FAILED", message: err.message };
  }
}

// ---------------------------------------------------------------------------
// Signal detector — shells out to the deterministic script. Kept simple so
// the meta-agent's prompt can call this once at the top of its turn and
// receive the same JSON Layer A produces in CI.
// ---------------------------------------------------------------------------

function runSignalDetector() {
  if (!existsSync(SIGNAL_DETECTOR_SCRIPT)) {
    return { error_code: "SIGNAL_SCRIPT_MISSING", message: `Signal detector not found at ${SIGNAL_DETECTOR_SCRIPT}` };
  }
  const result = spawnSync(process.execPath, [SIGNAL_DETECTOR_SCRIPT, "--project-root", PROJECT_ROOT], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    timeout: 30_000,
  });
  if (result.error) {
    return { error_code: "SIGNAL_SCRIPT_ERROR", message: result.error.message };
  }
  if (result.status !== 0) {
    return {
      error_code: "SIGNAL_SCRIPT_FAILED",
      message: `exit ${result.status}; stderr: ${(result.stderr || "").slice(0, 600)}`,
    };
  }
  try {
    return JSON.parse(result.stdout || "{}");
  } catch (err) {
    return { error_code: "SIGNAL_SCRIPT_BAD_JSON", message: err.message };
  }
}

// ---------------------------------------------------------------------------
// MCP server registration
// ---------------------------------------------------------------------------

const server = new McpServer({ name: "repo-editor", version: "1.0.0" });

server.registerTool(
  "get_self_improvement_signals",
  {
    title: "Get Self-Improvement Signals (deterministic, no LLM)",
    description:
      "Runs scripts/detect-self-improvement-signal.mjs and returns the JSON. The result is the trigger evidence Layer A produced for this CI tick: { shouldRun, agents[], signals[], housekeeping[] }. Call this FIRST in every turn — your only job when `shouldRun` is false is to summarise that fact and exit without proposing edits.",
    inputSchema: {},
  },
  async () => {
    const result = runSignalDetector();
    if (result.error_code) {
      return toolError(result.error_code, result.message);
    }
    return toolText(result);
  },
);

server.registerTool(
  "get_issue_context",
  {
    title: "Get GitHub Issue Context",
    description:
      "Reads `.agent-self-improvement/issue-context.json` written by the issue-implementer workflow before this agent runs. Returns `{ available, issue: { number, title, body, labels, comments[] }, extraInstructions? }`. Call this FIRST — if `available` is false, stop without proposing edits.",
    inputSchema: {},
  },
  async () => {
    if (!existsSync(ISSUE_CONTEXT_PATH)) {
      return toolText({
        available: false,
        error_code: "ISSUE_CONTEXT_MISSING",
        message: `No issue context at ${ISSUE_CONTEXT_REL}. The issue-implementer workflow must run scripts/build-issue-context.mjs first.`,
      });
    }
    try {
      const raw = readFileSync(ISSUE_CONTEXT_PATH, "utf8");
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return toolText({
          available: false,
          error_code: "ISSUE_CONTEXT_INVALID",
          message: "issue-context.json is not a valid object",
        });
      }
      return toolText({ available: true, ...parsed });
    } catch (err) {
      return toolError("ISSUE_CONTEXT_READ_FAILED", err.message);
    }
  },
);

server.registerTool(
  "list_run_log",
  {
    title: "List Run Log Tail",
    description:
      "Reads the tail of agents/memory/<agent>/run-log.<network>.jsonl and returns the parsed JSON entries (newest last). Use this to gather concrete `closedPositions[]`, `errors[]`, `riskOfficerVerdicts[]`, and `writeActions[]` evidence to cite in your proposal justifications.",
    inputSchema: {
      agent: z.string().describe("Agent name (e.g. 'mining-manager', 'quality-matrix-manager')"),
      network: z.string().optional().default("sepolia").describe("Network key the run log is namespaced under (defaults to 'sepolia')"),
      limit: z.number().int().optional().default(50).describe("Max entries to return from the tail (1..200, default 50)"),
    },
  },
  async ({ agent, network = "sepolia", limit = 50 }) => {
    if (!agent || typeof agent !== "string") {
      return toolError("INVALID_AGENT", "`agent` is required and must be a non-empty string");
    }
    const safeLimit = Math.max(1, Math.min(MAX_RUN_LOG_LIMIT, Number(limit) || 50));
    const filePath = resolve(PROJECT_ROOT, "agents", "memory", agent, `run-log.${network}.jsonl`);
    if (!existsSync(filePath)) {
      return toolError(
        "RUN_LOG_NOT_FOUND",
        `No run log at agents/memory/${agent}/run-log.${network}.jsonl`,
        { recoveryHint: "Call get_self_improvement_signals to discover which (agent, network) pairs exist." },
      );
    }
    let raw;
    try {
      raw = readFileSync(filePath, "utf8");
    } catch (err) {
      return toolError("RUN_LOG_READ_FAILED", err.message);
    }
    const lines = raw.split("\n").filter((l) => l.trim());
    const tail = lines.slice(-safeLimit);
    const entries = [];
    for (const line of tail) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        // ignore corrupt line — same approach as readRecentRunLog in agent-runner.mjs
      }
    }
    return toolText({
      agent,
      network,
      totalLines: lines.length,
      returnedCount: entries.length,
      entries,
    });
  },
);

server.registerTool(
  "read_repo_file",
  {
    title: "Read Repo File (allowlisted)",
    description:
      "Reads a file from the repo, gated by the same allowlist that gates proposal writes (see apps/mcps/repo-editor/allowlist.js). Use this to read the current agent .md / skill .md / runner / MCP source before proposing an edit, so your `search` string matches the file verbatim. Files larger than 256 KB are returned truncated with a notice; use `sliceStart`/`sliceLength` to page through them.",
    inputSchema: {
      path: z.string().describe("Repo-relative file path (e.g. 'agents/quality-matrix-manager.md')"),
      sliceStart: z.number().int().nonnegative().optional().describe("Optional byte offset for partial reads"),
      sliceLength: z.number().int().positive().optional().describe("Optional byte length for partial reads (default = MAX_FILE_READ_BYTES)"),
    },
  },
  async ({ path: inputPath, sliceStart, sliceLength }) => {
    const guard = checkPath(inputPath, PROJECT_ROOT);
    if (!guard.ok) {
      return toolError(guard.error_code, guard.message, { ruleId: guard.ruleId || null });
    }
    const absPath = resolve(PROJECT_ROOT, guard.relPath);
    if (!existsSync(absPath)) {
      return toolError("FILE_NOT_FOUND", `No such file: ${guard.relPath}`);
    }
    const stats = statSync(absPath);
    if (!stats.isFile()) {
      return toolError("NOT_A_FILE", `${guard.relPath} is not a regular file`);
    }
    let raw;
    try {
      raw = readFileSync(absPath, "utf8");
    } catch (err) {
      return toolError("FILE_READ_FAILED", err.message);
    }
    const start = Number.isFinite(sliceStart) ? Math.max(0, Number(sliceStart)) : 0;
    const length = Number.isFinite(sliceLength) ? Math.max(1, Number(sliceLength)) : MAX_FILE_READ_BYTES;
    const slice = raw.slice(start, start + length);
    const truncated = slice.length < raw.length - start;
    return toolText({
      path: guard.relPath,
      requiresReviewKind: guard.requiresReviewKind,
      totalBytes: Buffer.byteLength(raw, "utf8"),
      sliceStart: start,
      sliceLength: slice.length,
      truncated,
      contents: slice,
    });
  },
);

server.registerTool(
  "propose_file_edit",
  {
    title: "Propose File Edit (search/replace, manifest-only)",
    description:
      "Records an edit proposal in .agent-self-improvement/proposed-edits.json. NEVER mutates the repo on disk — that happens in scripts/apply-self-improvement-proposals.mjs after the risk-officer approves. Each `search` must match the file VERBATIM (no regex, no fuzzy match); read_repo_file first to confirm the exact text. Pass `convictionWeight` in (0,1] so a risk-officer downsize verdict can trim weak edits while keeping strong ones.",
    inputSchema: {
      path: z.string().describe("Repo-relative target path"),
      replacements: z
        .array(
          z.object({
            search: z.string().min(1).describe("Exact substring to replace"),
            replace: z.string().describe("Replacement substring (may be empty to delete)"),
          }),
        )
        .min(1)
        .describe("One or more substring replacements applied in order"),
      justification: z
        .string()
        .min(1)
        .describe("Why this edit (cite >=2 run-log entries by timestamp + ticker / error_code)"),
      convictionWeight: z
        .number()
        .optional()
        .describe("Confidence in (0,1]; risk-officer downsize trims edits below the cutoff (default 0.6)"),
    },
  },
  async ({ path: inputPath, replacements, justification, convictionWeight }) => {
    const guard = checkPath(inputPath, PROJECT_ROOT);
    if (!guard.ok) {
      return toolError(guard.error_code, guard.message, { ruleId: guard.ruleId || null });
    }
    // For replace edits we ALSO verify the file exists and every `search`
    // is actually present, so the applier can never silently fail.
    const absPath = resolve(PROJECT_ROOT, guard.relPath);
    if (!existsSync(absPath)) {
      return toolError(
        "FILE_NOT_FOUND",
        `Cannot propose an edit to a non-existent file: ${guard.relPath}. Use propose_file_create for new files.`,
      );
    }
    let current;
    try {
      current = readFileSync(absPath, "utf8");
    } catch (err) {
      return toolError("FILE_READ_FAILED", err.message);
    }
    // Load the manifest BEFORE validating so we can replay prior edits
    // against the same path — this catches cross-edit interference
    // (edit A perturbs the region edit B's `search` covers) at
    // propose-time instead of leaving it for the applier to discover
    // after the risk-officer turn has already burned LLM budget.
    let manifest;
    try {
      manifest = readManifest();
    } catch (err) {
      return toolError("MANIFEST_READ_FAILED", err.message);
    }
    const replay = replayPriorEdits({
      manifest,
      targetPath: guard.relPath,
      baseContents: current,
    });
    if (!replay.ok) {
      return toolError(
        "PRIOR_EDIT_REPLAY_FAILED",
        `${replay.message}. Re-read the file and reconcile with the prior manifest entry (or drop it via summarize_proposals) before stacking another edit.`,
        { offendingEditId: replay.offendingEditId },
      );
    }
    const preview = previewReplaceEdit({
      filePath: guard.relPath,
      contents: replay.scratch,
      replacements,
    });
    if (!preview.ok) {
      const replacementIdx = Number.isInteger(preview.replacementIndex)
        ? preview.replacementIndex
        : 0;
      const offending = replacements[replacementIdx];
      const hint = preview.error_code === "SEARCH_NOT_FOUND"
        ? `Refused: replacement #${replacementIdx + 1} \`search\` was not found in ${guard.relPath} (after replaying ${manifest.edits.filter((e) => e.path === guard.relPath && e.kind === "replace").length} prior edit(s) against the same file). Call read_repo_file and copy the exact substring (incl. whitespace).`
        : `Refused: replacement #${replacementIdx + 1} \`search\` appears more than once in ${guard.relPath} (after replaying prior edits). Expand the snippet so it uniquely identifies the location.`;
      return toolError(preview.error_code, hint, {
        snippetTried: offending && typeof offending.search === "string"
          ? offending.search.slice(0, 200)
          : null,
      });
    }
    try {
      const { added, edit } = addReplaceEdit(manifest, {
        path: guard.relPath,
        requiresReviewKind: guard.requiresReviewKind,
        replacements,
        justification,
        convictionWeight,
      });
      writeManifest(manifest);
      return toolText({
        success: true,
        added,
        edit,
        manifestPath: PROPOSAL_MANIFEST_REL,
        totalEdits: manifest.edits.length,
      });
    } catch (err) {
      return toolError("MANIFEST_WRITE_FAILED", err.message);
    }
  },
);

server.registerTool(
  "propose_file_create",
  {
    title: "Propose File Create (manifest-only)",
    description:
      "Records a new-file proposal. The target path must pass the allowlist (typically a new agents/skills/<name>.md). NEVER mutates the repo on disk.",
    inputSchema: {
      path: z.string().describe("Repo-relative new file path"),
      contents: z.string().min(1).describe("Full file contents to write on apply"),
      justification: z.string().min(1).describe("Why this new file is needed"),
      convictionWeight: z.number().optional().describe("Confidence in (0,1]; default 0.6"),
    },
  },
  async ({ path: inputPath, contents, justification, convictionWeight }) => {
    const guard = checkPath(inputPath, PROJECT_ROOT);
    if (!guard.ok) {
      return toolError(guard.error_code, guard.message, { ruleId: guard.ruleId || null });
    }
    const absPath = resolve(PROJECT_ROOT, guard.relPath);
    if (existsSync(absPath)) {
      return toolError(
        "FILE_ALREADY_EXISTS",
        `Refused: ${guard.relPath} already exists. Use propose_file_edit to modify it.`,
      );
    }
    let manifest;
    try {
      manifest = readManifest();
      const { added, edit } = addCreateEdit(manifest, {
        path: guard.relPath,
        requiresReviewKind: guard.requiresReviewKind,
        contents,
        justification,
        convictionWeight,
      });
      writeManifest(manifest);
      return toolText({
        success: true,
        added,
        edit,
        manifestPath: PROPOSAL_MANIFEST_REL,
        totalEdits: manifest.edits.length,
      });
    } catch (err) {
      return toolError("MANIFEST_WRITE_FAILED", err.message);
    }
  },
);

server.registerTool(
  "propose_file_rename",
  {
    title: "Propose File Rename (manifest-only)",
    description:
      "Records a rename proposal. Both source and destination must pass the allowlist. NEVER mutates the repo on disk.",
    inputSchema: {
      path: z.string().describe("Current repo-relative path"),
      newPath: z.string().describe("Proposed new repo-relative path"),
      justification: z.string().min(1).describe("Why this rename improves the strategy"),
      convictionWeight: z.number().optional(),
    },
  },
  async ({ path: inputPath, newPath, justification, convictionWeight }) => {
    const guardA = checkPath(inputPath, PROJECT_ROOT);
    if (!guardA.ok) return toolError(guardA.error_code, guardA.message, { side: "source", ruleId: guardA.ruleId || null });
    const guardB = checkPath(newPath, PROJECT_ROOT);
    if (!guardB.ok) return toolError(guardB.error_code, guardB.message, { side: "destination", ruleId: guardB.ruleId || null });
    const absA = resolve(PROJECT_ROOT, guardA.relPath);
    const absB = resolve(PROJECT_ROOT, guardB.relPath);
    if (!existsSync(absA)) {
      return toolError("FILE_NOT_FOUND", `Cannot rename non-existent file: ${guardA.relPath}`);
    }
    if (existsSync(absB)) {
      return toolError("DEST_ALREADY_EXISTS", `Refused: ${guardB.relPath} already exists.`);
    }
    let manifest;
    try {
      manifest = readManifest();
      const { added, edit } = addRenameEdit(manifest, {
        path: guardA.relPath,
        newPath: guardB.relPath,
        requiresReviewKind: guardA.requiresReviewKind || guardB.requiresReviewKind,
        justification,
        convictionWeight,
      });
      writeManifest(manifest);
      return toolText({
        success: true,
        added,
        edit,
        manifestPath: PROPOSAL_MANIFEST_REL,
        totalEdits: manifest.edits.length,
      });
    } catch (err) {
      return toolError("MANIFEST_WRITE_FAILED", err.message);
    }
  },
);

server.registerTool(
  "summarize_proposals",
  {
    title: "Summarize Proposed Edits",
    description:
      "Returns the full current proposal manifest plus derived helpers (touched paths, touched agents, allow-list rule reference). Call this before your final summary so you can include the manifest's edit IDs in your `## Thesis`.",
    inputSchema: {},
  },
  async () => {
    const manifest = readManifest();
    return toolText({
      manifest,
      touchedPaths: listTouchedPaths(manifest),
      touchedAgents: listTouchedAgents(manifest),
      allowRules: listAllowRules(),
      denyRules: listDenyRules(),
      manifestPath: PROPOSAL_MANIFEST_REL,
    });
  },
);

// ---------------------------------------------------------------------------
// Issues channel — propose_issue + list_open_issues
// ---------------------------------------------------------------------------

server.registerTool(
  "propose_issue",
  {
    title: "Propose GitHub Issue (manifest-only, issues channel)",
    description:
      `Records a broader, more speculative improvement idea in .agent-self-improvement/proposed-issues.json. NEVER opens a GitHub issue from here — that happens in scripts/apply-self-improvement-issues.mjs after the issue risk-officer approves. Use this instead of propose_file_edit when (a) you cannot yet specify a precise code change, or (b) the idea requires a human design call. Body is plain markdown (no diff required). category must be one of ${JSON.stringify(CATEGORY_ENUM)}. Pass convictionWeight in (0,1] so a downsize verdict can trim weak issues. Title max ${MAX_TITLE_CHARS} chars; body max ${MAX_BODY_CHARS} chars. Duplicates within this run are silently merged.`,
    inputSchema: {
      title: z.string().describe(`Concise human-readable issue title (<= ${MAX_TITLE_CHARS} chars)`),
      body: z.string().describe(`Plain markdown body (<= ${MAX_BODY_CHARS} chars). Cite at least one run-log pattern.`),
      category: z
        .enum(CATEGORY_ENUM)
        .describe(`One of: ${CATEGORY_ENUM.join(", ")}`),
      justification: z
        .string()
        .min(1)
        .describe("Short rationale separate from the issue body — risk-officer reads this for the approve/downsize/veto decision"),
      convictionWeight: z
        .number()
        .optional()
        .describe("Confidence in (0,1]; risk-officer downsize trims issues below the cutoff (default 0.5)"),
    },
  },
  async ({ title, body, category, justification, convictionWeight }) => {
    let manifest;
    try {
      manifest = readIssueManifest();
    } catch (err) {
      return toolError("MANIFEST_READ_FAILED", err.message);
    }
    let result;
    try {
      result = addIssue(manifest, { title, body, category, justification, convictionWeight });
    } catch (err) {
      return toolError("ISSUE_VALIDATION_FAILED", err.message);
    }
    try {
      writeIssueManifest(manifest);
    } catch (err) {
      return toolError("MANIFEST_WRITE_FAILED", err.message);
    }
    return toolText({
      success: true,
      added: result.added,
      issue: result.issue,
      manifestPath: ISSUE_MANIFEST_REL,
      totalIssues: manifest.issues.length,
      issueIds: listIssueIds(manifest),
      categoriesInManifest: listIssueCategories(manifest),
    });
  },
);

server.registerTool(
  "list_open_issues",
  {
    title: "List Open GitHub Issues (gh shell-out, issues channel)",
    description:
      "Shells out to `gh issue list --state open --json number,title,labels,createdAt,url`. Returns parsed JSON. If `gh` is missing, unauthenticated, or rate-limited, returns { available: false, error_code: 'GH_NOT_AVAILABLE' } — the caller can still proceed (the issue opener's cap-respecting filter catches dups). Use to avoid filing an issue that already exists.",
    inputSchema: {
      label: z
        .string()
        .optional()
        .describe("Optional label filter, e.g. 'agent-finding' to scope to the self-improver-issues template's queue (and human-filed findings)"),
      search: z
        .string()
        .optional()
        .describe("Optional GitHub issue search expression (e.g. a snippet of the title)"),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(`Max issues to return (1..${MAX_GH_ISSUE_LIST_LIMIT}, default 30)`),
    },
  },
  async ({ label, search, limit }) => {
    const r = ghIssueList({ label, search, state: "open", limit });
    if (!r.available) {
      return toolText({
        available: false,
        error_code: r.error_code,
        message: r.message,
        recoveryHint:
          "Proceed without dedup awareness — the issue opener still dedupes via gh issue list + the per-period cap before any new issue is filed.",
      });
    }
    return toolText({
      available: true,
      count: r.issues.length,
      issues: r.issues,
    });
  },
);

// ---------------------------------------------------------------------------
// Bring up stdio transport
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
