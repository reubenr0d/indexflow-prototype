#!/usr/bin/env node

// MCP server for the `self-improver` meta-agent. Read-only against the
// whole repo (gated by `allowlist.js`), write-only into a proposal
// manifest at `.agent-self-improvement/proposed-edits.json`. The on-disk
// repo is never mutated by this server — that happens in
// `scripts/apply-self-improvement-proposals.mjs` AFTER the risk-officer
// has approved the manifest.
//
// Tools exposed (see plan, Layer B'):
//   - get_self_improvement_signals()
//   - list_run_log({ agent, network, limit })
//   - read_repo_file({ path, sliceStart?, sliceLength? })
//   - propose_file_edit({ path, replacements[], justification, convictionWeight? })
//   - propose_file_create({ path, contents, justification, convictionWeight? })
//   - propose_file_rename({ path, newPath, justification, convictionWeight? })
//   - summarize_proposals()
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

const PROJECT_ROOT = resolve(process.env.PROJECT_ROOT || process.cwd());
const MANIFEST_PATH = resolve(PROJECT_ROOT, PROPOSAL_MANIFEST_REL);
const SIGNAL_DETECTOR_SCRIPT = resolve(PROJECT_ROOT, "scripts", "detect-self-improvement-signal.mjs");
const MAX_FILE_READ_BYTES = 256 * 1024; // 256 KB is more than enough for any agent .md or runner section
const MAX_RUN_LOG_LIMIT = 200;

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
    let scratch = current;
    for (const r of replacements) {
      const idx = scratch.indexOf(r.search);
      if (idx === -1) {
        return toolError(
          "SEARCH_NOT_FOUND",
          `Refused: replacement #${replacements.indexOf(r) + 1} \`search\` was not found in ${guard.relPath}. Call read_repo_file and copy the exact substring (incl. whitespace).`,
          { snippetTried: r.search.slice(0, 200) },
        );
      }
      const before = scratch.slice(0, idx);
      const after = scratch.slice(idx + r.search.length);
      const dupAfter = after.indexOf(r.search);
      if (dupAfter !== -1) {
        return toolError(
          "SEARCH_AMBIGUOUS",
          `Refused: replacement #${replacements.indexOf(r) + 1} \`search\` appears more than once in ${guard.relPath}. Expand the snippet so it uniquely identifies the location.`,
        );
      }
      scratch = before + r.replace + after;
    }
    let manifest;
    try {
      manifest = readManifest();
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
// Bring up stdio transport
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
