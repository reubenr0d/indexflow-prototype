#!/usr/bin/env node

// PR-opener for the self-improver meta-loop. Reads:
//   - .agent-self-improvement/proposed-edits.json (the manifest the
//     `self-improver` agent built via the repo-editor MCP)
//   - .agent-self-improvement/risk-officer-verdict.json (output of
//     scripts/run-self-improvement-risk-officer.mjs)
//
// Two operating modes (CLI flag):
//   --apply-locally-only  Re-validates the manifest against the allowlist,
//                         applies search/replace + create + rename edits to
//                         the working tree, and exits. Used by the workflow's
//                         dry-run replay step.
//   --open-pr             Re-validates + applies + (a) housekeeping rotations
//                         from the signal detector + (b) creates a stable
//                         agent-improve/<UTC date>-<signal hash> branch +
//                         (c) commits + pushes + opens a PR via `gh pr
//                         create` (skip if one already exists for the same
//                         branch). Never auto-merges.
//
// Defence-in-depth: every path is re-checked against allowlist.js, every
// `search` string is re-verified to be present-and-unique in the current
// file, and an explicit allowlist of files staged into the commit prevents
// drift between "what the manifest covers" and "what git sees".

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, appendFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkPath,
  PROPOSAL_MANIFEST_REL,
} from "../apps/mcps/repo-editor/allowlist.js";
import { listTouchedAgents, listTouchedPaths } from "../apps/mcps/repo-editor/proposal-manifest.js";
import { detectSelfImprovementSignals } from "./detect-self-improvement-signal.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(process.env.PROJECT_ROOT || resolve(__dirname, ".."));
const MANIFEST_PATH = resolve(PROJECT_ROOT, PROPOSAL_MANIFEST_REL);
const VERDICT_PATH = resolve(PROJECT_ROOT, ".agent-self-improvement", "risk-officer-verdict.json");
const SIGNAL_PATH = resolve(PROJECT_ROOT, ".agent-self-improvement", "signal.json");

const PR_LABEL_AGENT = "agent-self-improvement";
const PR_LABEL_REVIEW = "needs-human-review";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function shortHash(s) {
  return createHash("sha256").update(s, "utf8").digest("hex").slice(0, 8);
}

function readJsonOrNull(p) {
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

// Returns { ok, file, error_code?, message? }. Validates that `search`
// is present AND unique in the current file contents, so the applier
// can never silently mis-target a hit.
export function previewReplaceEdit({ filePath, contents, replacements }) {
  let scratch = contents;
  for (let i = 0; i < replacements.length; i++) {
    const r = replacements[i];
    const idx = scratch.indexOf(r.search);
    if (idx === -1) {
      return {
        ok: false,
        error_code: "SEARCH_NOT_FOUND",
        message: `Replacement #${i + 1} \`search\` not found in ${filePath}`,
      };
    }
    const before = scratch.slice(0, idx);
    const after = scratch.slice(idx + r.search.length);
    if (after.indexOf(r.search) !== -1) {
      return {
        ok: false,
        error_code: "SEARCH_AMBIGUOUS",
        message: `Replacement #${i + 1} \`search\` appears more than once in ${filePath}`,
      };
    }
    scratch = before + r.replace + after;
  }
  return { ok: true, newContents: scratch };
}

export function computeBranchName({ signals, now = new Date() }) {
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  if (!signals || signals.length === 0) return `agent-improve/${dateStr}-nosignal`;
  // Stable hash across the signal ids so two ticks firing the same set of
  // signals on the same UTC day land on the same branch (PR dedupe).
  const ids = [...signals].map((s) => s.id || s.kind).sort().join("|");
  return `agent-improve/${dateStr}-${shortHash(ids)}`;
}

export function buildPrTitle({ signals }) {
  if (!signals || signals.length === 0) return "agent: self-improvement proposals";
  const firstAgent = signals[0].agent || "agent";
  const kinds = Array.from(new Set(signals.map((s) => s.kind))).sort().join(", ");
  return `agent: self-improvement (${firstAgent}) — ${kinds}`;
}

export function buildPrBody({ manifest, verdict, signals, housekeeping, touchedPaths }) {
  const lines = [];
  lines.push("This PR was opened by the `self-improver` meta-agent after a vault-agent CI tick.");
  lines.push("");
  lines.push("## Trigger signals");
  if (!signals || signals.length === 0) {
    lines.push("- (no signals — likely a housekeeping-only PR)");
  } else {
    for (const s of signals) {
      lines.push(`- **${s.kind}** on \`${s.agent}\` (${s.network}): ${s.summary}`);
    }
  }
  lines.push("");
  lines.push("## Proposed edits");
  lines.push("");
  lines.push("| id | kind | path | conviction | requiresReviewKind |");
  lines.push("|---|---|---|---|---|");
  for (const e of manifest.edits || []) {
    lines.push(`| \`${e.id}\` | ${e.kind} | \`${e.path}\` | ${e.convictionWeight.toFixed(2)} | ${e.requiresReviewKind || "—"} |`);
  }
  lines.push("");
  lines.push("### Justifications");
  for (const e of manifest.edits || []) {
    lines.push(`- **\`${e.id}\`** (\`${e.path}\`): ${e.justification}`);
  }
  lines.push("");
  lines.push("## Risk officer verdict");
  lines.push("");
  if (verdict) {
    lines.push(`- **verdict**: \`${verdict.verdict}\``);
    lines.push(`- **reason**: ${verdict.reason || "—"}`);
    if (verdict.kind === "downsize") {
      lines.push(`- **downsizeThreshold**: ${verdict.downsizeThreshold ?? verdict.downsizeFactor ?? "—"}`);
      lines.push(`- **droppedEditIds**: ${(verdict.droppedEditIds || []).join(", ") || "—"}`);
    }
  } else {
    lines.push("- (verdict file missing — opened with caveat)");
  }
  lines.push("");
  if (housekeeping && housekeeping.length > 0) {
    lines.push("## Housekeeping rotations");
    for (const h of housekeeping) {
      lines.push(`- \`${h.sourceFile}\` → \`${h.archiveFile}\` (${h.entryCount} entries older than 90d)`);
    }
    lines.push("");
  }
  lines.push("## Files touched");
  for (const p of touchedPaths) lines.push(`- \`${p}\``);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("Generated by [`scripts/apply-self-improvement-proposals.mjs`](scripts/apply-self-improvement-proposals.mjs). Labelled `needs-human-review` — a human must merge.");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Apply edits to the working tree
// ---------------------------------------------------------------------------

function applyEditsToWorkingTree(manifest) {
  const applied = [];
  const failed = [];
  for (const edit of manifest.edits || []) {
    const guard = checkPath(edit.path, PROJECT_ROOT);
    if (!guard.ok) {
      failed.push({ id: edit.id, path: edit.path, error_code: guard.error_code, message: guard.message });
      continue;
    }
    const abs = resolve(PROJECT_ROOT, guard.relPath);
    try {
      if (edit.kind === "replace") {
        const current = readFileSync(abs, "utf8");
        const preview = previewReplaceEdit({
          filePath: guard.relPath,
          contents: current,
          replacements: edit.replacements || [],
        });
        if (!preview.ok) {
          failed.push({ id: edit.id, path: edit.path, error_code: preview.error_code, message: preview.message });
          continue;
        }
        writeFileSync(abs, preview.newContents);
        applied.push({ id: edit.id, path: guard.relPath, kind: "replace" });
      } else if (edit.kind === "create") {
        if (existsSync(abs)) {
          failed.push({ id: edit.id, path: edit.path, error_code: "FILE_ALREADY_EXISTS" });
          continue;
        }
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, edit.contents);
        applied.push({ id: edit.id, path: guard.relPath, kind: "create" });
      } else if (edit.kind === "rename") {
        const destGuard = checkPath(edit.newPath, PROJECT_ROOT);
        if (!destGuard.ok) {
          failed.push({ id: edit.id, path: edit.newPath, error_code: destGuard.error_code, message: destGuard.message });
          continue;
        }
        const destAbs = resolve(PROJECT_ROOT, destGuard.relPath);
        if (!existsSync(abs)) {
          failed.push({ id: edit.id, path: edit.path, error_code: "FILE_NOT_FOUND" });
          continue;
        }
        if (existsSync(destAbs)) {
          failed.push({ id: edit.id, path: edit.newPath, error_code: "DEST_ALREADY_EXISTS" });
          continue;
        }
        mkdirSync(dirname(destAbs), { recursive: true });
        renameSync(abs, destAbs);
        applied.push({ id: edit.id, path: guard.relPath, newPath: destGuard.relPath, kind: "rename" });
      } else {
        failed.push({ id: edit.id, path: edit.path, error_code: "UNKNOWN_EDIT_KIND" });
      }
    } catch (err) {
      failed.push({ id: edit.id, path: edit.path, error_code: "WRITE_FAILED", message: err.message });
    }
  }
  return { applied, failed };
}

function applyHousekeepingRotations(housekeeping) {
  const out = [];
  for (const h of housekeeping || []) {
    if (h.kind !== "rotate_run_log") continue;
    const srcAbs = resolve(PROJECT_ROOT, h.sourceFile);
    const dstAbs = resolve(PROJECT_ROOT, h.archiveFile);
    if (!existsSync(srcAbs)) {
      out.push({ ...h, applied: false, reason: "source missing" });
      continue;
    }
    try {
      const raw = readFileSync(srcAbs, "utf8");
      const lines = raw.split("\n").filter((l) => l.trim());
      const oldEntries = [];
      const newEntries = [];
      const cutoffMs = h.cutoffMs;
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          const tsMs = Date.parse(entry?.timestamp || "");
          if (Number.isFinite(tsMs) && tsMs < cutoffMs) {
            oldEntries.push(line);
          } else {
            newEntries.push(line);
          }
        } catch {
          // Keep corrupt lines on the live file (don't quietly archive them).
          newEntries.push(line);
        }
      }
      if (oldEntries.length === 0) {
        out.push({ ...h, applied: false, reason: "no entries older than cutoff" });
        continue;
      }
      mkdirSync(dirname(dstAbs), { recursive: true });
      appendFileSync(dstAbs, oldEntries.join("\n") + "\n");
      writeFileSync(srcAbs, newEntries.join("\n") + (newEntries.length > 0 ? "\n" : ""));
      out.push({ ...h, applied: true, rotatedCount: oldEntries.length });
    } catch (err) {
      out.push({ ...h, applied: false, reason: err.message });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// git + gh helpers (only used by --open-pr mode)
// ---------------------------------------------------------------------------

function git(args, opts = {}) {
  return execFileSync("git", args, { cwd: PROJECT_ROOT, encoding: "utf8", stdio: opts.stdio || "pipe", ...opts });
}

function gh(args, opts = {}) {
  return execFileSync("gh", args, { cwd: PROJECT_ROOT, encoding: "utf8", stdio: opts.stdio || "pipe", ...opts });
}

function ensureBranch(branchName) {
  // Stash uncommitted changes first? In the workflow we run on a clean
  // checkout so this is mostly defensive.
  try {
    git(["fetch", "origin", branchName]);
  } catch {
    // remote branch may not exist yet — fine
  }
  // If the local branch exists, reuse it; otherwise create from current HEAD.
  const branches = git(["branch", "--list", branchName]).trim();
  if (branches) {
    git(["checkout", branchName]);
  } else {
    git(["checkout", "-B", branchName]);
  }
}

function stageAndCommit({ paths, message }) {
  if (paths.length === 0) return { committed: false, reason: "no paths to stage" };
  // Use `git add --` so paths starting with `-` don't confuse the parser.
  git(["add", "--", ...paths]);
  const cached = git(["diff", "--cached", "--name-only"]).trim();
  if (!cached) return { committed: false, reason: "git add produced no staged diff" };
  // Set author identity to the same bot used by the commit-results job in
  // vault-agent.yml so the audit trail is consistent.
  git(["-c", "user.name=vault-agent[bot]", "-c", "user.email=vault-agent[bot]@users.noreply.github.com", "commit", "-m", message]);
  return { committed: true };
}

function pushBranch(branchName) {
  git(["push", "-u", "origin", branchName, "--force-with-lease"]);
}

function findExistingPr(branchName) {
  try {
    const json = gh(["pr", "list", "--head", branchName, "--state", "open", "--json", "number,url,title"]);
    const arr = JSON.parse(json || "[]");
    return Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
  } catch (err) {
    // gh may not be installed locally; surface as a warning, never crash.
    return null;
  }
}

function openPr({ branchName, title, body, base = "main" }) {
  const args = [
    "pr",
    "create",
    "--head",
    branchName,
    "--base",
    base,
    "--title",
    title,
    "--body",
    body,
    "--label",
    PR_LABEL_AGENT,
    "--label",
    PR_LABEL_REVIEW,
  ];
  const out = gh(args);
  return out.trim();
}

// ---------------------------------------------------------------------------
// Top-level orchestration
// ---------------------------------------------------------------------------

export async function applyProposals({ mode, signalsOverride, now = new Date() } = {}) {
  const manifest = readJsonOrNull(MANIFEST_PATH);
  if (!manifest || !Array.isArray(manifest.edits) || manifest.edits.length === 0) {
    return {
      ok: true,
      noop: true,
      reason: "no proposed edits — nothing to apply",
    };
  }
  const verdict = readJsonOrNull(VERDICT_PATH);
  if (verdict && verdict.verdict === "veto") {
    return {
      ok: true,
      noop: true,
      reason: `risk-officer vetoed: ${verdict.reason || ""}`,
    };
  }
  if (verdict && verdict.kind === "downsize" && (manifest.edits || []).length === 0) {
    return {
      ok: true,
      noop: true,
      reason: `risk-officer downsize trimmed every edit (reason: ${verdict.reason || "—"})`,
    };
  }

  // Re-validate every edit against the allowlist before mutating disk.
  for (const e of manifest.edits) {
    const guard = checkPath(e.path, PROJECT_ROOT);
    if (!guard.ok) {
      return {
        ok: false,
        error: `Manifest contains path that fails allowlist: ${e.path} (${guard.error_code})`,
      };
    }
  }

  const applyResult = applyEditsToWorkingTree(manifest);
  if (applyResult.failed.length > 0 && applyResult.applied.length === 0) {
    return {
      ok: false,
      error: `All ${applyResult.failed.length} edits failed to apply; first: ${JSON.stringify(applyResult.failed[0])}`,
      applyResult,
    };
  }

  // Layer detector also emits housekeeping. Read directly (cheap) so the
  // same loop applies rotations onto the working tree.
  const signalPayload = readJsonOrNull(SIGNAL_PATH) || detectSelfImprovementSignals({
    now: now.getTime(),
    projectRoot: PROJECT_ROOT,
  });
  const housekeepingResult = applyHousekeepingRotations(signalPayload.housekeeping || []);

  if (mode === "apply-locally-only") {
    return {
      ok: true,
      mode,
      applyResult,
      housekeepingResult,
      touchedPaths: listTouchedPaths(manifest),
      touchedAgents: listTouchedAgents(manifest),
    };
  }

  // mode === "open-pr": commit + push + gh pr create
  const signals = signalsOverride || signalPayload.signals || [];
  const branchName = computeBranchName({ signals, now });
  const title = buildPrTitle({ signals });
  const body = buildPrBody({
    manifest,
    verdict,
    signals,
    housekeeping: housekeepingResult,
    touchedPaths: listTouchedPaths(manifest).concat(
      (housekeepingResult || [])
        .filter((h) => h.applied)
        .flatMap((h) => [h.sourceFile, h.archiveFile]),
    ),
  });

  const pathsToStage = [];
  for (const a of applyResult.applied) {
    pathsToStage.push(a.path);
    if (a.newPath) pathsToStage.push(a.newPath);
  }
  for (const h of housekeepingResult) {
    if (h.applied) {
      pathsToStage.push(h.sourceFile);
      pathsToStage.push(h.archiveFile);
    }
  }

  try {
    ensureBranch(branchName);
    const commitMessage = title + "\n\nSigned-off-by: vault-agent[bot] <vault-agent[bot]@users.noreply.github.com>";
    const commitResult = stageAndCommit({ paths: pathsToStage, message: commitMessage });
    if (!commitResult.committed) {
      return {
        ok: true,
        noop: true,
        reason: `nothing to commit (${commitResult.reason})`,
        branchName,
      };
    }
    pushBranch(branchName);
  } catch (err) {
    return { ok: false, error: `git operation failed: ${err.message}` };
  }

  const existing = findExistingPr(branchName);
  if (existing) {
    return {
      ok: true,
      mode,
      branchName,
      prUrl: existing.url,
      prNumber: existing.number,
      reused: true,
    };
  }

  try {
    const prUrl = openPr({ branchName, title, body });
    return { ok: true, mode, branchName, prUrl };
  } catch (err) {
    return { ok: false, error: `gh pr create failed: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseCliArgs(argv) {
  let mode = null;
  for (const a of argv) {
    if (a === "--apply-locally-only") mode = "apply-locally-only";
    else if (a === "--open-pr") mode = "open-pr";
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
    console.error("Usage: node scripts/apply-self-improvement-proposals.mjs (--apply-locally-only | --open-pr)");
    process.exit(2);
  }
  const result = await applyProposals({ mode });
  if (!result.ok) {
    console.error(`[apply-self-improvement-proposals] ${result.error || "unknown failure"}`);
    process.exit(3);
  }
  console.log(JSON.stringify(result, null, 2));
}
