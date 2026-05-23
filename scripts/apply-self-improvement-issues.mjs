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
//                    labels matching `.github/ISSUE_TEMPLATE/agent-finding.yml`
//                    (`agent-finding`, `needs-human-review`) plus a
//                    dynamic `category:<x>` label.
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
import {
  ISSUE_LABELS,
  buildLabelCreateArgs,
} from "../apps/mcps/repo-editor/agent-labels.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(process.env.PROJECT_ROOT || resolve(__dirname, ".."));
const ISSUE_MANIFEST_PATH = resolve(PROJECT_ROOT, ".agent-self-improvement", "proposed-issues.json");
const VERDICT_PATH = resolve(PROJECT_ROOT, ".agent-self-improvement", "issue-risk-officer-verdict.json");
const SIGNAL_PATH = resolve(PROJECT_ROOT, ".agent-self-improvement", "signal.json");

// Labels match `.github/ISSUE_TEMPLATE/agent-finding.yml` verbatim so an
// issue filed by the bot and one filed by a human via the form land in
// the same triage queue (and the dedup pass below sees both).
const LABEL_AGENT = "agent-finding";
const LABEL_TRIAGE = "needs-human-review";
// Title prefix the agent-finding form auto-applies (`title: "agent: "`).
// Mirroring it here keeps bot-filed and human-filed issues sortable
// together in the GitHub issue list.
const TITLE_PREFIX = "agent: ";
// The agent identity threaded into the rendered body's "Agent name"
// field (matches the `agent_name` form input on agent-finding.yml).
const SELF_IMPROVER_ISSUES_AGENT_NAME = "self-improver-issues";
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
// callsite (and the tests don't need to import two modules). Defaults
// `agentName` to the self-improver-issues identity so the rendered body
// fills in the agent-finding form's `agent_name` field; callers can
// override (e.g. for tests, or a future channel that re-uses this
// helper).
export function buildIssueBody({
  issue,
  signals = [],
  manifestId = null,
  agentName = SELF_IMPROVER_ISSUES_AGENT_NAME,
}) {
  return formatIssueBody({ issue, signals, manifestId, agentName });
}

// Bot-filed issues are prefixed with `agent: ` to match the
// agent-finding form's auto-applied title prefix. Idempotent: re-runs
// against a manifest entry already prefixed don't double up.
export function buildIssueTitle(proposalTitle) {
  const t = String(proposalTitle || "").trim();
  if (t.toLowerCase().startsWith(TITLE_PREFIX)) return t;
  return `${TITLE_PREFIX}${t}`;
}

// Decide whether to file `proposal` given the current set of open issues.
// Returns `{ skip, reason, dedupeMatch? }`. We dedupe by (in order):
//   1. id marker baked into an open issue's body (round-trip key; survives
//      title drift and is the load-bearing dedup),
//   2. exact title match after applying the `agent: ` prefix the bot
//      uses (so a previous bot-filed issue is caught regardless of
//      whether its body still contains the marker), and
//   3. exact title match against the raw (unprefixed) manifest title
//      (catches human-filed `agent-finding` issues whose author
//      omitted the prefix).
export function shouldSkipProposal({ proposal, openIssues }) {
  if (!proposal || !proposal.id || !proposal.title) {
    return { skip: true, reason: "proposal missing id or title" };
  }
  const rawTitle = String(proposal.title).trim();
  const prefixedTitle = buildIssueTitle(rawTitle);
  for (const oi of openIssues || []) {
    const marker = extractIssueIdMarker(oi.body || "");
    if (marker && marker === proposal.id) {
      return {
        skip: true,
        reason: `id marker ${proposal.id} already present in open issue #${oi.number}`,
        dedupeMatch: oi,
      };
    }
    const openTitle = String(oi.title || "").trim();
    if (openTitle === prefixedTitle || openTitle === rawTitle) {
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
// ordering without spawning anything. Title is always re-prefixed with
// `agent: ` (idempotent) and labels mirror the agent-finding template
// (`agent-finding` + `needs-human-review`) plus the dynamic
// `category:<x>` label the form can't auto-apply since it depends on
// the dropdown selection.
export function buildGhCreateArgs({ proposal, body }) {
  return [
    "issue",
    "create",
    "--title",
    buildIssueTitle(proposal.title),
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

// Idempotently `gh label create --force` every label spec we ship to
// `gh issue create`. `--force` updates colour/description if the label
// already exists, so this is safe to call every tick. Soft-fails per
// label (warns but does not throw) — if `gh issue create` then
// succeeds because the label happened to already exist, we keep
// going; if it still fails, the original error surfaces as before.
export function ensureLabelsExist({ labels, runner = spawnSync } = {}) {
  const results = [];
  for (const label of labels || []) {
    const args = buildLabelCreateArgs(label);
    const result = runner("gh", args, {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      timeout: 20_000,
      env: { ...process.env },
    });
    if (result.error) {
      console.warn(
        `[apply-self-improvement-issues] could not bootstrap label "${label.name}": ${result.error.message}`,
      );
      results.push({ name: label.name, ok: false, message: result.error.message });
      continue;
    }
    if (result.status !== 0) {
      const stderr = (result.stderr || "").trim();
      console.warn(
        `[apply-self-improvement-issues] gh label create exited ${result.status} for "${label.name}": ${stderr.slice(0, 200)}`,
      );
      results.push({ name: label.name, ok: false, message: stderr });
      continue;
    }
    results.push({ name: label.name, ok: true });
  }
  return results;
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

  // Bootstrap the labels referenced by `buildGhCreateArgs` so the
  // first `gh issue create` doesn't fail with
  // "could not add label: 'agent-finding' not found". Only run when
  // we actually have proposals to file — no point churning labels on
  // an empty manifest.
  if (cap_filter.kept.length > 0) {
    ensureLabelsExist({ labels: ISSUE_LABELS, runner: ghRunner });
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
