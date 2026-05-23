#!/usr/bin/env node

// Risk-officer pass for the self-improver-issues meta-agent's issue
// proposal manifest. Mirrors `scripts/run-self-improvement-risk-officer.mjs`
// but operates on `.agent-self-improvement/proposed-issues.json` and
// produces `.agent-self-improvement/issue-risk-officer-verdict.json`.
//
// Three exit modes:
//   - verdict approve   -> exit 0, manifest untouched
//   - verdict downsize  -> exit 0, manifest filtered in-place via
//                          dropLowConvictionIssues(threshold)
//   - verdict veto      -> exit 0, manifest cleared (empty issues[])
//
// The script ALWAYS exits 0 unless something genuinely broken happens
// (LLM unreachable, manifest corrupt). The issue-opener
// (`apply-self-improvement-issues.mjs`) inspects the verdict file and
// decides whether to call `gh issue create`.
//
// Env:
//   LLM_API_KEY                       (required when the manifest has any issues)
//   LLM_BASE_URL                      (default https://api.openai.com/v1)
//   LLM_MODEL                         (default gpt-4o; gpt-4o-mini fine)
//   PROJECT_ROOT                      (default = repo root)
//   GH_TOKEN                          (optional; needed for the openIssues fetch via gh)
//   MAX_OPEN_SELF_IMPROVER_ISSUES     (default 10; the per-period cap the
//                                      risk-officer enforces alongside the opener)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { parseRiskOfficerVerdict } from "./agent-runner-confirmation.mjs";
import { dropLowConvictionIssues } from "../apps/mcps/repo-editor/issue-manifest.js";
import { detectSelfImprovementSignals } from "./detect-self-improvement-signal.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(process.env.PROJECT_ROOT || resolve(__dirname, ".."));
const ISSUE_MANIFEST_REL = ".agent-self-improvement/proposed-issues.json";
const ISSUE_MANIFEST_PATH = resolve(PROJECT_ROOT, ISSUE_MANIFEST_REL);
const VERDICT_PATH = resolve(PROJECT_ROOT, ".agent-self-improvement", "issue-risk-officer-verdict.json");
const PROMPT_PATH = resolve(PROJECT_ROOT, "agents", "risk-officer-self-improvement-issues.md");
const RECENT_VERDICTS_PATH = resolve(PROJECT_ROOT, ".agent-self-improvement", "recent-issue-verdicts.json");
// Matches the `agent-finding.yml` issue-template label so the cap-respecting
// dedup also catches issues a human filed via the form (kept in sync with
// `LABEL_AGENT` in scripts/apply-self-improvement-issues.mjs).
const ISSUE_LABEL = "agent-finding";

const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_BASE_URL = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
const LLM_MODEL = process.env.LLM_MODEL || "gpt-4o";
const MAX_RECENT_VERDICTS = 20;
const DEFAULT_OPEN_ISSUE_CAP = 10;

function readIssueCap() {
  const raw = process.env.MAX_OPEN_SELF_IMPROVER_ISSUES;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_OPEN_ISSUE_CAP;
  return Math.floor(n);
}

// ---------------------------------------------------------------------------
// Manifest + ledger IO
// ---------------------------------------------------------------------------

function readManifest() {
  if (!existsSync(ISSUE_MANIFEST_PATH)) return null;
  try {
    return JSON.parse(readFileSync(ISSUE_MANIFEST_PATH, "utf8"));
  } catch (err) {
    throw new Error(`Issue manifest at ${ISSUE_MANIFEST_PATH} is not valid JSON: ${err.message}`);
  }
}

function writeManifest(manifest) {
  mkdirSync(dirname(ISSUE_MANIFEST_PATH), { recursive: true });
  writeFileSync(ISSUE_MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
}

function writeVerdict(verdict) {
  mkdirSync(dirname(VERDICT_PATH), { recursive: true });
  writeFileSync(VERDICT_PATH, JSON.stringify(verdict, null, 2) + "\n");
}

function readRecentVerdicts() {
  if (!existsSync(RECENT_VERDICTS_PATH)) return [];
  try {
    const parsed = JSON.parse(readFileSync(RECENT_VERDICTS_PATH, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function appendRecentVerdict(entry) {
  const existing = readRecentVerdicts();
  const next = [...existing, entry].slice(-MAX_RECENT_VERDICTS);
  mkdirSync(dirname(RECENT_VERDICTS_PATH), { recursive: true });
  writeFileSync(RECENT_VERDICTS_PATH, JSON.stringify(next, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// Open-issues lookup (gh shell-out; graceful fallback)
// ---------------------------------------------------------------------------

export function ghOpenIssues({ label = ISSUE_LABEL, limit = 50, runner = spawnSync } = {}) {
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
      String(Math.max(1, Math.min(100, Number(limit) || 50))),
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

// ---------------------------------------------------------------------------
// Build the user payload for the issue risk-officer LLM call.
// ---------------------------------------------------------------------------

export function buildIssueRiskOfficerUserPayload({
  manifest,
  signals,
  openIssues,
  cap,
  recentVerdicts,
}) {
  return {
    manifest: {
      version: manifest.version,
      agent: manifest.agent,
      createdAt: manifest.createdAt,
      updatedAt: manifest.updatedAt,
      issues: (manifest.issues || []).map((i) => ({
        id: i.id,
        title: i.title,
        body: i.body,
        category: i.category,
        justification: i.justification,
        convictionWeight: i.convictionWeight,
        createdAt: i.createdAt,
      })),
    },
    signals: signals || [],
    openIssues: openIssues || [],
    currentOpenIssueCount: (openIssues || []).length,
    cap,
    recentSelfImproverIssueRuns: (recentVerdicts || []).slice(-10),
  };
}

// ---------------------------------------------------------------------------
// LLM call (OpenAI-compatible)
// ---------------------------------------------------------------------------

export async function callIssueRiskOfficerLlm({ systemPrompt, userPayload, llmCall }) {
  if (typeof llmCall === "function") {
    return llmCall(systemPrompt, JSON.stringify(userPayload));
  }
  if (!LLM_API_KEY) {
    throw new Error("LLM_API_KEY is required to run the issue risk-officer pass");
  }
  const resp = await fetch(`${LLM_BASE_URL.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`LLM request failed: ${resp.status} ${resp.statusText} ${text.slice(0, 400)}`);
  }
  const json = await resp.json();
  return json?.choices?.[0]?.message?.content || "";
}

// ---------------------------------------------------------------------------
// Pure verdict application — extracted so it can be unit-tested.
// ---------------------------------------------------------------------------

export function applyVerdictToIssueManifest({ manifest, verdict }) {
  if (!verdict || typeof verdict !== "object") {
    return { kind: "approve", manifest, dropped: [], rejected: false };
  }
  if (verdict.verdict === "veto") {
    return {
      kind: "veto",
      manifest: { ...manifest, issues: [], updatedAt: new Date().toISOString() },
      dropped: manifest.issues || [],
      rejected: true,
    };
  }
  if (verdict.verdict === "downsize") {
    const threshold = Number(verdict.downsizeThreshold);
    if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
      return { kind: "approve", manifest, dropped: [], rejected: false };
    }
    const { kept, dropped } = dropLowConvictionIssues(manifest, threshold);
    return { kind: "downsize", manifest: kept, dropped, rejected: false, threshold };
  }
  return { kind: "approve", manifest, dropped: [], rejected: false };
}

// ---------------------------------------------------------------------------
// Pure helper: should we short-circuit to a veto purely from the open-issue
// cap, regardless of LLM verdict? Used by the orchestrator AND directly
// testable. Returns `{ veto: bool, reason: string }`.
// ---------------------------------------------------------------------------

export function checkCapPreflight({ openIssueCount, cap, proposalCount }) {
  if (!Number.isFinite(openIssueCount) || !Number.isFinite(cap)) {
    return { veto: false, reason: "" };
  }
  if (openIssueCount >= cap) {
    return {
      veto: true,
      reason: `cap full: ${openIssueCount} open issues already labelled ${ISSUE_LABEL} (cap=${cap}); refusing to file more until humans triage`,
    };
  }
  const headroom = cap - openIssueCount;
  if (proposalCount > headroom) {
    return {
      veto: false,
      reason: `cap headroom is ${headroom} but manifest holds ${proposalCount} proposals; risk-officer should downsize`,
    };
  }
  return { veto: false, reason: "" };
}

// ---------------------------------------------------------------------------
// Top-level orchestration
// ---------------------------------------------------------------------------

export async function runIssueRiskOfficer({ now = Date.now(), llmCall, ghRunner } = {}) {
  let manifest;
  try {
    manifest = readManifest();
  } catch (err) {
    return { ok: false, error: err.message };
  }

  if (!manifest || !Array.isArray(manifest.issues) || manifest.issues.length === 0) {
    const empty = {
      verdict: "approve",
      reason: "issue manifest is empty — nothing to review",
      raw: "",
      proposalCount: 0,
      droppedCount: 0,
      kind: "approve",
    };
    writeVerdict(empty);
    return { ok: true, verdict: empty };
  }

  const cap = readIssueCap();
  const ghResult = ghOpenIssues({ runner: ghRunner });
  const openIssues = ghResult.issues || [];

  // Cap preflight — veto immediately if the queue is already full, no
  // LLM round-trip needed.
  const preflight = checkCapPreflight({
    openIssueCount: openIssues.length,
    cap,
    proposalCount: manifest.issues.length,
  });
  if (preflight.veto) {
    const verdict = {
      verdict: "veto",
      reason: preflight.reason,
      raw: "",
      proposalCount: manifest.issues.length,
      droppedCount: manifest.issues.length,
      droppedIssueIds: (manifest.issues || []).map((i) => i.id),
      kind: "veto",
      cap,
      openIssueCount: openIssues.length,
      ghAvailable: ghResult.available,
    };
    const applied = applyVerdictToIssueManifest({ manifest, verdict });
    writeManifest(applied.manifest);
    writeVerdict(verdict);
    appendRecentVerdict({
      timestamp: new Date(now).toISOString(),
      verdict: "veto",
      reason: preflight.reason,
      proposalCount: verdict.proposalCount,
      droppedCount: verdict.droppedCount,
      issueIds: (manifest.issues || []).map((i) => i.id),
    });
    return { ok: true, verdict, manifest: applied.manifest };
  }

  let systemPrompt;
  try {
    const raw = readFileSync(PROMPT_PATH, "utf8");
    const fmMatch = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
    systemPrompt = (fmMatch ? fmMatch[1] : raw).trim();
  } catch (err) {
    return { ok: false, error: `Failed to read issue risk-officer prompt: ${err.message}` };
  }

  const signals = detectSelfImprovementSignals({ now, projectRoot: PROJECT_ROOT }).signals;
  const recentVerdicts = readRecentVerdicts();
  const userPayload = buildIssueRiskOfficerUserPayload({
    manifest,
    signals,
    openIssues,
    cap,
    recentVerdicts,
  });

  let rawReply = "";
  try {
    rawReply = await callIssueRiskOfficerLlm({ systemPrompt, userPayload, llmCall });
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const parsed = parseRiskOfficerVerdict(rawReply);
  let normalised = parsed;
  if (!normalised) {
    try {
      const fenceless = rawReply.replace(/```(?:json)?/g, "").trim();
      const match = fenceless.match(/\{[\s\S]*\}/);
      if (match) {
        const obj = JSON.parse(match[0]);
        if (obj && ["approve", "downsize", "veto"].includes(obj.verdict)) {
          normalised = {
            verdict: obj.verdict,
            reason: String(obj.reason || ""),
            downsizeFactor: obj.downsizeFactor,
            downsizeThreshold: obj.downsizeThreshold,
          };
        }
      }
    } catch {
      // ignore
    }
  }
  if (normalised && normalised.verdict === "downsize") {
    if (!normalised.downsizeThreshold && Number.isFinite(Number(normalised.downsizeFactor))) {
      normalised.downsizeThreshold = Number(normalised.downsizeFactor);
    }
  }

  const verdict = normalised || {
    verdict: "approve",
    reason: "issue risk-officer reply was not valid JSON; defaulting to approve",
  };
  verdict.raw = rawReply.slice(0, 4000);
  verdict.proposalCount = manifest.issues.length;
  verdict.cap = cap;
  verdict.openIssueCount = openIssues.length;
  verdict.ghAvailable = ghResult.available;

  const applied = applyVerdictToIssueManifest({ manifest, verdict });
  verdict.droppedCount = applied.dropped.length;
  verdict.droppedIssueIds = applied.dropped.map((i) => i.id);
  verdict.kind = applied.kind;

  if (applied.kind === "downsize" || applied.kind === "veto") {
    writeManifest(applied.manifest);
  }

  writeVerdict(verdict);
  appendRecentVerdict({
    timestamp: new Date(now).toISOString(),
    verdict: verdict.verdict,
    reason: verdict.reason,
    proposalCount: verdict.proposalCount,
    droppedCount: verdict.droppedCount,
    issueIds: (manifest.issues || []).map((i) => i.id),
  });
  return { ok: true, verdict, manifest: applied.manifest };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const isCli =
  typeof process !== "undefined" &&
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  const result = await runIssueRiskOfficer();
  if (!result.ok) {
    console.error(`[risk-officer-self-improvement-issues] ${result.error}`);
    process.exit(2);
  }
  console.log(
    `[risk-officer-self-improvement-issues] verdict=${result.verdict.verdict} dropped=${result.verdict.droppedCount}/${result.verdict.proposalCount}`,
  );
  console.log(`reason: ${result.verdict.reason}`);
}
