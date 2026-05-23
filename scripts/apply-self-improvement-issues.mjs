#!/usr/bin/env node

// Issue-opener for the self-improver-issues meta-loop. Reads:
//   - .agent-self-improvement/proposed-issues.json         (issue manifest)
//   - .agent-self-improvement/issue-risk-officer-verdict.json (verdict)
//   - .agent-self-improvement/signal.json                  (Layer A context)
//
// Two operating modes (CLI flag):
//   --dry-run        Print what would be filed; do NOT call `gh issue create`.
//   --open-issues    Dedupe against open issues via `gh issue list`, respect
//                    the MAX_OPEN_SELF_IMPROVER_ISSUES cap (default 10), and
//                    call `gh issue create` per surviving proposal with
//                    labels: `agent-self-improvement-issue`,
//                    `needs-human-triage`, `category:<x>`.
//
// Pure additive: never edits existing issues, never assigns, never closes
// anything. The id marker embedded in the issue body
// (`<!-- self-improver-issue-id: <id> -->`) is the round-trip key — a
// future tick will skip this proposal if any open issue still carries it.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatIssueBody,
  extractIssueIdMarker,
  ISSUE_ID_MARKER_PREFIX,
} from "../apps/mcps/repo-editor/issue-manifest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(process.env.PROJECT_ROOT || resolve(__dirname, ".."));
const ISSUE_MANIFEST_PATH = resolve(PROJECT_ROOT, ".agent-self-improvement", "proposed-issues.json");
const VERDICT_PATH = resolve(PROJECT_ROOT, ".agent-self-improvement", "issue-risk-officer-verdict.json");
const SIGNAL_PATH = resolve(PROJECT_ROOT, ".agent-self-improvement", "signal.json");

const LABEL_AGENT = "agent-self-improvement-issue";
const LABEL_TRIAGE = "needs-human-triage";
const DEFAULT_OPEN_ISSUE_CAP = 10;
const GH_LIST_MAX = 100;

// ---------------------------------------------------------------------------
// Pure helpers (exported so they can be unit-tested without spawning gh).
// ---------------------------------------------------------------------------

export function readIssueCap(env = process.env) {
  const raw = env.MAX_OPEN_SELF_IMPROVER_ISSUES;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_OPEN_ISSUE_CAP;
  return Math.floor(n);
}

// Build the full body string the applier ships to `gh issue create`.
// Wrapper around the shared `formatIssueBody` so the opener has a single
// callsite (and the tests don't need to import two modules).
export function buildIssueBody({ issue, signals = [], manifestId = null }) {
  return formatIssueBody({ issue, signals, manifestId });
}

// Decide whether to file `proposal` given the current set of open issues.
// Returns `{ skip, reason, dedupeMatch? }`. We dedupe by:
//   1. id marker baked into an open issue's body (round-trip key), and
//   2. exact title match.
// The risk-officer already pre-screens dedup, but a follow-up tick that
// runs while the previous PR is still mid-flight could still race with it.
export function shouldSkipProposal({ proposal, openIssues }) {
  if (!proposal || !proposal.id || !proposal.title) {
    return { skip: true, reason: "proposal missing id or title" };
  }
  for (const oi of openIssues || []) {
    const marker = extractIssueIdMarker(oi.body || "");
    if (marker && marker === proposal.id) {
      return {
        skip: true,
        reason: `id marker ${proposal.id} already present in open issue #${oi.number}`,
        dedupeMatch: oi,
      };
    }
    if ((oi.title || "").trim() === proposal.title.trim()) {
      return {
        skip: true,
        reason: `exact title match with open issue #${oi.number}`,
        dedupeMatch: oi,
      };
    }
  }
  return { skip: false };
}

// Cap-respecting filter: given the proposals that survived dedup AND the
// current open-issue count, return at most `headroom` proposals (ranked
// by convictionWeight DESC so the strongest survive). Pure.
export function applyCapFilter({ survivors, openIssueCount, cap }) {
  const headroom = Math.max(0, cap - openIssueCount);
  if (headroom === 0) {
    return { kept: [], dropped: survivors, headroom };
  }
  if (survivors.length <= headroom) {
    return { kept: survivors, dropped: [], headroom };
  }
  const sorted = [...survivors].sort(
    (a, b) => (b.convictionWeight || 0) - (a.convictionWeight || 0),
  );
  return {
    kept: sorted.slice(0, headroom),
    dropped: sorted.slice(headroom),
    headroom,
  };
}

// Pure: build the argv array that the applier will hand to
// `gh issue create`. Extracted so the tests can pin exact label / arg
// ordering without spawning anything.
export function buildGhCreateArgs({ proposal, body }) {
  return [
    "issue",
    "create",
    "--title",
    proposal.title,
    "--body",
    body,
    "--label",
    LABEL_AGENT,
    "--label",
    LABEL_TRIAGE,
    "--label",
    `category:${proposal.category}`,
  ];
}

// ---------------------------------------------------------------------------
// IO + gh shell-outs
// ---------------------------------------------------------------------------

function readJsonOrNull(p) {
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function ghListOpenIssues({ label = LABEL_AGENT, limit = GH_LIST_MAX, runner = spawnSync } = {}) {
  const result = runner(
    "gh",
    [
      "issue",
      "list",
      "--state",
      "open",
      "--label",
      label,
      "--json",
      "number,title,labels,createdAt,url,body",
      "--limit",
      String(Math.max(1, Math.min(GH_LIST_MAX, Number(limit) || GH_LIST_MAX))),
    ],
    { cwd: PROJECT_ROOT, encoding: "utf8", timeout: 20_000, env: { ...process.env } },
  );
  if (result.error) {
    return { available: false, error_code: "GH_NOT_AVAILABLE", message: result.error.message, issues: [] };
  }
  if (result.status !== 0) {
    return {
      available: false,
      error_code: "GH_NOT_AVAILABLE",
      message: `gh exit ${result.status}: ${(result.stderr || "").slice(0, 400)}`,
      issues: [],
    };
  }
  try {
    const parsed = JSON.parse(result.stdout || "[]");
    return { available: true, issues: Array.isArray(parsed) ? parsed : [] };
  } catch (err) {
    return { available: false, error_code: "GH_PARSE_FAILED", message: err.message, issues: [] };
  }
}

function ghIssueCreate(args) {
  return execFileSync("gh", args, { cwd: PROJECT_ROOT, encoding: "utf8" }).trim();
}

// ---------------------------------------------------------------------------
// Top-level orchestration
// ---------------------------------------------------------------------------

export async function applyIssueProposals({ mode, ghRunner, ghCreate = ghIssueCreate } = {}) {
  const manifest = readJsonOrNull(ISSUE_MANIFEST_PATH);
  if (!manifest || !Array.isArray(manifest.issues) || manifest.issues.length === 0) {
    return { ok: true, noop: true, reason: "no proposed issues — nothing to apply" };
  }
  const verdict = readJsonOrNull(VERDICT_PATH);
  if (verdict && verdict.verdict === "veto") {
    return { ok: true, noop: true, reason: `issue risk-officer vetoed: ${verdict.reason || ""}` };
  }
  if (verdict && verdict.kind === "downsize" && (manifest.issues || []).length === 0) {
    return { ok: true, noop: true, reason: `downsize trimmed every issue (reason: ${verdict.reason || "—"})` };
  }

  const signalPayload = readJsonOrNull(SIGNAL_PATH) || { signals: [] };
  const signals = Array.isArray(signalPayload.signals) ? signalPayload.signals : [];
  const cap = readIssueCap();

  const ghList = ghListOpenIssues({ runner: ghRunner });
  const openIssues = ghList.issues || [];

  const dedupe = { survivors: [], skipped: [] };
  for (const proposal of manifest.issues) {
    const check = shouldSkipProposal({ proposal, openIssues });
    if (check.skip) {
      dedupe.skipped.push({ id: proposal.id, title: proposal.title, reason: check.reason });
    } else {
      dedupe.survivors.push(proposal);
    }
  }

  const cap_filter = applyCapFilter({
    survivors: dedupe.survivors,
    openIssueCount: openIssues.length,
    cap,
  });

  if (mode === "dry-run") {
    return {
      ok: true,
      mode,
      cap,
      openIssueCount: openIssues.length,
      ghAvailable: ghList.available,
      dedupeSkipped: dedupe.skipped,
      capDropped: cap_filter.dropped.map((p) => ({ id: p.id, title: p.title })),
      wouldFile: cap_filter.kept.map((p) => ({ id: p.id, title: p.title, category: p.category })),
    };
  }

  const filed = [];
  const failed = [];
  for (const proposal of cap_filter.kept) {
    const body = buildIssueBody({
      issue: proposal,
      signals,
      manifestId: manifest.id || manifest.createdAt || null,
    });
    const args = buildGhCreateArgs({ proposal, body });
    try {
      const out = ghCreate(args);
      filed.push({ id: proposal.id, title: proposal.title, category: proposal.category, url: out });
    } catch (err) {
      failed.push({ id: proposal.id, title: proposal.title, error: err.message });
    }
  }

  return {
    ok: failed.length === 0,
    mode,
    cap,
    openIssueCount: openIssues.length,
    ghAvailable: ghList.available,
    dedupeSkipped: dedupe.skipped,
    capDropped: cap_filter.dropped.map((p) => ({ id: p.id, title: p.title })),
    filed,
    failed,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseCliArgs(argv) {
  let mode = null;
  for (const a of argv) {
    if (a === "--dry-run") mode = "dry-run";
    else if (a === "--open-issues") mode = "open-issues";
  }
  return { mode };
}

const isCli =
  typeof process !== "undefined" &&
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  const { mode } = parseCliArgs(process.argv.slice(2));
  if (!mode) {
    console.error("Usage: node scripts/apply-self-improvement-issues.mjs (--dry-run | --open-issues)");
    process.exit(2);
  }
  const result = await applyIssueProposals({ mode });
  if (!result.ok) {
    console.error(`[apply-self-improvement-issues] some issues failed to file`);
    console.error(JSON.stringify(result, null, 2));
    process.exit(3);
  }
  console.log(JSON.stringify(result, null, 2));
}
