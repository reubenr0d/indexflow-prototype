// Pure helpers for the GitHub-issue proposal manifest at
// `.agent-self-improvement/proposed-issues.json`. Sibling of
// `proposal-manifest.js` — same shape, different payload kind. Extracted
// from the MCP server so they can be unit-tested directly (no stdio, no
// spawn, no network).
//
// Manifest shape (versioned so the applier can detect a stale layout):
//
//   {
//     version: 1,
//     createdAt: ISO,
//     updatedAt: ISO,
//     agent: "self-improver-issues",
//     issues: [
//       {
//         id: <SHA-12 of the title>,        // also baked into the body
//                                            // as an HTML comment for
//                                            // round-trip identification
//                                            // by the applier's dedupe
//                                            // logic.
//         title: string,                    // <= MAX_TITLE_CHARS
//         body: string,                     // <= MAX_BODY_CHARS, markdown
//         category: enum,                   // see CATEGORY_ENUM
//         justification: string,
//         convictionWeight: number in [0,1],
//         createdAt: ISO,
//       },
//       ...
//     ],
//   }
//
// Invariants enforced on insert:
//   * title length <= MAX_TITLE_CHARS (otherwise the GitHub UI truncates)
//   * body length  <= MAX_BODY_CHARS  (a soft cap to keep PR-bot diff
//                                      noise low; gh issue create supports
//                                      huge bodies but humans don't)
//   * category     in CATEGORY_ENUM
//   * convictionWeight clamped to [0, 1]
//   * dedupe by title hash within the run
//
// The id doubles as the GitHub-side round-trip key: the applier bakes it
// into the issue body as `<!-- self-improver-issue-id: <id> -->` so a
// later run can grep open issues for the marker and skip dups regardless
// of title drift.

import { createHash } from "node:crypto";

export const ISSUE_MANIFEST_VERSION = 1;
export const MAX_TITLE_CHARS = 120;
export const MAX_BODY_CHARS = 8000;
export const CATEGORY_ENUM = [
  "new_mcp_or_skill",
  "strategy_idea",
  "data_gap",
  "refactor",
  "investigation",
  // Partnership pipeline blocker surfaced by `partnership-tracker`. The
  // softer rubric in `agents/risk-officer-self-improvement-issues.md`
  // (no vault-address gate, conviction floor 0.5) lets BD-ops findings
  // reuse the same manifest + opener + dedupe pipeline as engineering
  // findings.
  "partnership-blocker",
  // New-vault theme proposal surfaced by `basket-ideator` as the
  // handoff issue that accompanies the `growth/basket-concepts/queue/`
  // markdown draft. Distinct from `new_mcp_or_skill` (which targets
  // engineering surface) because vault-concept proposals route to a
  // different human reviewer (founder + curator persona owner, not the
  // engineering triage queue).
  "vault-concept",
];
export const ISSUE_ID_MARKER_PREFIX = "self-improver-issue-id:";

function nowIso() {
  return new Date().toISOString();
}

function clampConviction(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.5;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function titleHash(title) {
  return createHash("sha256").update(String(title || ""), "utf8").digest("hex").slice(0, 12);
}

export function emptyIssueManifest() {
  const ts = nowIso();
  return {
    version: ISSUE_MANIFEST_VERSION,
    createdAt: ts,
    updatedAt: ts,
    agent: "self-improver-issues",
    issues: [],
  };
}

export function findDuplicateIssue(manifest, candidateTitle) {
  if (!manifest || !Array.isArray(manifest.issues)) return null;
  const hash = titleHash(candidateTitle);
  for (const i of manifest.issues) {
    if (i.id === hash) return i;
    if (i.title === candidateTitle) return i;
  }
  return null;
}

export function addIssue(manifest, { title, body, category, justification, convictionWeight }) {
  if (typeof title !== "string" || !title.trim()) {
    throw new Error("addIssue: title must be a non-empty string");
  }
  if (title.length > MAX_TITLE_CHARS) {
    throw new Error(`addIssue: title exceeds MAX_TITLE_CHARS (${MAX_TITLE_CHARS})`);
  }
  if (typeof body !== "string" || !body.trim()) {
    throw new Error("addIssue: body must be a non-empty markdown string");
  }
  if (body.length > MAX_BODY_CHARS) {
    throw new Error(`addIssue: body exceeds MAX_BODY_CHARS (${MAX_BODY_CHARS})`);
  }
  if (!CATEGORY_ENUM.includes(category)) {
    throw new Error(`addIssue: category must be one of ${JSON.stringify(CATEGORY_ENUM)}`);
  }
  if (typeof justification !== "string" || !justification.trim()) {
    throw new Error("addIssue: justification must be a non-empty string");
  }
  const dup = findDuplicateIssue(manifest, title);
  if (dup) return { added: false, issue: dup };
  const issue = {
    id: titleHash(title),
    title: title.trim(),
    body: body.trim(),
    category,
    justification: justification.trim().slice(0, 4000),
    convictionWeight: clampConviction(convictionWeight ?? 0.5),
    createdAt: nowIso(),
  };
  manifest.issues.push(issue);
  manifest.updatedAt = nowIso();
  return { added: true, issue };
}

// Drop issues whose convictionWeight is below `threshold`. Used by the
// risk-officer's downsize verdict to keep the strongest 1-2 issues from
// a noisy batch.
export function dropLowConvictionIssues(manifest, threshold) {
  const cutoff = Number(threshold);
  if (!Number.isFinite(cutoff)) return { kept: manifest, dropped: [] };
  const dropped = [];
  const kept = [];
  for (const i of manifest.issues || []) {
    if (i.convictionWeight < cutoff) dropped.push(i);
    else kept.push(i);
  }
  return {
    kept: { ...manifest, issues: kept, updatedAt: nowIso() },
    dropped,
  };
}

export function listIssueCategories(manifest) {
  if (!manifest?.issues) return [];
  const seen = new Set();
  for (const i of manifest.issues) seen.add(i.category);
  return Array.from(seen).sort();
}

export function listIssueIds(manifest) {
  if (!manifest?.issues) return [];
  return manifest.issues.map((i) => i.id);
}

// Format the body the applier ships to `gh issue create`. Field order
// here is intentionally aligned with the `.github/ISSUE_TEMPLATE/agent-finding.yml`
// form (category → summary → agent_name → justification → conviction
// → trigger_signals → marker), so an issue filed by an agent and one
// filed by a human via the form render identically. The
// ISSUE_ID_MARKER_PREFIX line at the bottom is the load-bearing
// round-trip key — `apply-self-improvement-issues.mjs` greps open
// issues for it before opening a new one. DO NOT rename or relocate
// that marker without updating `extractIssueIdMarker` in lockstep.
export function formatIssueBody({ issue, signals = [], manifestId = null, agentName = null }) {
  const lines = [];

  // 1. category (matches the `category` dropdown in agent-finding.yml)
  lines.push(`**Category**: \`${issue.category}\``);
  lines.push("");

  // 2. summary (the agent-authored body — `summary` textarea in the form)
  lines.push("## Summary");
  lines.push("");
  lines.push(issue.body);
  lines.push("");

  // 3. agent_name (input on the form; optional on the manifest path —
  // self-improver-issues passes `agentName`, human-triggered callers
  // can omit it and we leave the field absent rather than fabricate).
  if (agentName) {
    lines.push(`**Agent name**: \`${agentName}\``);
    lines.push("");
  }

  // 4. justification (textarea on the form, always present on the manifest)
  if (issue.justification) {
    lines.push("## Justification");
    lines.push("");
    lines.push(issue.justification);
    lines.push("");
  }

  // 5. conviction_weight (dropdown 0.1–1.0 on the form; clamped to
  // [0,1] on the manifest by `clampConviction`).
  lines.push(`**Conviction (self-reported)**: ${issue.convictionWeight.toFixed(2)}`);
  lines.push("");

  // 6. trigger_signals (textarea on the form). Cap at 5 so a pathological
  // detector run can't blow out the body length budget.
  if (signals && signals.length > 0) {
    lines.push("## Trigger signals");
    lines.push("");
    for (const s of signals.slice(0, 5)) {
      lines.push(`- \`${s.kind}\` on \`${s.agent}\`: ${s.summary || ""}`);
    }
    lines.push("");
  }

  // 7. manifest_id + footer markers (round-trip dedupe key — keep
  // ISSUE_ID_MARKER_PREFIX exactly as-is so `extractIssueIdMarker`
  // keeps finding it).
  lines.push("---");
  lines.push("");
  lines.push(`<!-- ${ISSUE_ID_MARKER_PREFIX} ${issue.id} -->`);
  if (manifestId) {
    lines.push(`<!-- self-improver-manifest-id: ${manifestId} -->`);
  }
  lines.push(
    "<!-- Auto-filed by the `self-improver-issues` meta-agent via scripts/apply-self-improvement-issues.mjs. Risk-officer-reviewed before filing; human triage required. Close to suppress for ~24h (the cap-respecting filter still skips it after the marker reappears in run history). -->",
  );
  return lines.join("\n");
}

// Parse `<!-- self-improver-issue-id: <id> -->` markers out of GitHub
// issue bodies. Used by `apply-self-improvement-issues.mjs` for the
// dedup pass. Returns the first id found or null.
export function extractIssueIdMarker(body) {
  if (typeof body !== "string" || !body) return null;
  const re = new RegExp(`<!--\\s*${ISSUE_ID_MARKER_PREFIX}\\s*([a-f0-9]{8,16})\\s*-->`);
  const m = body.match(re);
  return m ? m[1] : null;
}
