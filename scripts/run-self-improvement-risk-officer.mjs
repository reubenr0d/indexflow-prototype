#!/usr/bin/env node

// Risk-officer pass for the self-improver meta-agent's proposal manifest.
// Reads `.agent-self-improvement/proposed-edits.json`, builds the
// user-payload (manifest + Layer A signals + current contents of every
// touched file + recent self-improver verdicts), calls the LLM with the
// system prompt from `agents/risk-officer-self-improvement.md`, and
// writes the verdict to `.agent-self-improvement/risk-officer-verdict.json`.
//
// Three exit modes:
//   - verdict approve   -> exit 0, manifest untouched
//   - verdict downsize  -> exit 0, manifest filtered in-place via
//                          dropLowConviction(threshold), dropped edits
//                          recorded in the verdict file
//   - verdict veto      -> exit 0, manifest cleared (empty edits[]),
//                          rejection logged
//
// The script ALWAYS exits 0 unless something genuinely broken happens (LLM
// unreachable, manifest corrupt, etc.) — a veto is an expected outcome,
// not a CI failure. The PR-opener script (`apply-self-improvement-
// proposals.mjs`) inspects the verdict file and decides whether to push.
//
// Env:
//   LLM_API_KEY  (required when the manifest has any edits)
//   LLM_BASE_URL (default https://api.openai.com/v1)
//   LLM_MODEL    (default gpt-4o; ideally cheaper than the main agent — gpt-4o-mini works fine)
//   PROJECT_ROOT (default = repo root)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { parseRiskOfficerVerdict } from "./agent-runner-confirmation.mjs";
import { dropLowConviction } from "../apps/mcps/repo-editor/proposal-manifest.js";
import {
  PROPOSAL_MANIFEST_REL,
  checkPath,
} from "../apps/mcps/repo-editor/allowlist.js";
import { detectSelfImprovementSignals } from "./detect-self-improvement-signal.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(process.env.PROJECT_ROOT || resolve(__dirname, ".."));
const MANIFEST_PATH = resolve(PROJECT_ROOT, PROPOSAL_MANIFEST_REL);
const VERDICT_PATH = resolve(PROJECT_ROOT, ".agent-self-improvement", "risk-officer-verdict.json");
const PROMPT_PATH = resolve(PROJECT_ROOT, "agents", "risk-officer-self-improvement.md");
const RECENT_VERDICTS_PATH = resolve(PROJECT_ROOT, ".agent-self-improvement", "recent-verdicts.json");

const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_BASE_URL = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
const LLM_MODEL = process.env.LLM_MODEL || "gpt-4o";
const TOUCHED_FILE_SNIPPET_BYTES = 4000;
const MAX_RECENT_VERDICTS = 20;

// ---------------------------------------------------------------------------
// Manifest IO
// ---------------------------------------------------------------------------

function readManifest() {
  if (!existsSync(MANIFEST_PATH)) return null;
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  } catch (err) {
    throw new Error(`Manifest at ${MANIFEST_PATH} is not valid JSON: ${err.message}`);
  }
}

function writeManifest(manifest) {
  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
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
// Build the user payload for the risk-officer LLM call.
// ---------------------------------------------------------------------------

function readTouchedFiles(manifest) {
  const out = {};
  if (!manifest?.edits) return out;
  for (const edit of manifest.edits) {
    if (edit.kind !== "replace" && edit.kind !== "rename") continue;
    const guard = checkPath(edit.path, PROJECT_ROOT);
    if (!guard.ok) {
      // Should never happen here (the MCP already gated this), but if it
      // does we record it so the risk-officer can veto on the spot.
      out[edit.path] = { error: guard.error_code, message: guard.message };
      continue;
    }
    const abs = resolve(PROJECT_ROOT, guard.relPath);
    if (!existsSync(abs)) {
      out[edit.path] = { error: "FILE_NOT_FOUND" };
      continue;
    }
    try {
      const raw = readFileSync(abs, "utf8");
      out[edit.path] = {
        totalBytes: Buffer.byteLength(raw, "utf8"),
        snippet: raw.slice(0, TOUCHED_FILE_SNIPPET_BYTES),
        truncated: raw.length > TOUCHED_FILE_SNIPPET_BYTES,
      };
    } catch (err) {
      out[edit.path] = { error: "FILE_READ_FAILED", message: err.message };
    }
  }
  return out;
}

export function buildRiskOfficerUserPayload({ manifest, signals, touchedFiles, recentVerdicts, allowRules }) {
  return {
    manifest: {
      version: manifest.version,
      agent: manifest.agent,
      createdAt: manifest.createdAt,
      updatedAt: manifest.updatedAt,
      edits: (manifest.edits || []).map((e) => ({
        id: e.id,
        kind: e.kind,
        path: e.path,
        newPath: e.newPath || null,
        requiresReviewKind: e.requiresReviewKind || null,
        convictionWeight: e.convictionWeight,
        justification: e.justification,
        replacements: e.replacements || null,
        contents: e.contents ? `<${e.contents.length} char new file>` : null,
      })),
    },
    signals: signals || [],
    touchedFiles: touchedFiles || {},
    allowRules: allowRules || [],
    recentSelfImproverRuns: (recentVerdicts || []).slice(-10),
  };
}

// ---------------------------------------------------------------------------
// LLM call (OpenAI-compatible)
// ---------------------------------------------------------------------------

export async function callRiskOfficerLlm({ systemPrompt, userPayload, llmCall }) {
  if (typeof llmCall === "function") {
    return llmCall(systemPrompt, JSON.stringify(userPayload));
  }
  if (!LLM_API_KEY) {
    throw new Error("LLM_API_KEY is required to run the risk-officer pass");
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

export function applyVerdictToManifest({ manifest, verdict }) {
  if (!verdict || typeof verdict !== "object") {
    return { kind: "approve", manifest, dropped: [], rejected: false };
  }
  if (verdict.verdict === "veto") {
    return {
      kind: "veto",
      manifest: { ...manifest, edits: [], updatedAt: new Date().toISOString() },
      dropped: manifest.edits || [],
      rejected: true,
    };
  }
  if (verdict.verdict === "downsize") {
    const threshold = Number(verdict.downsizeThreshold);
    if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
      // Malformed downsize -> safer to approve as-is than to mis-trim.
      return { kind: "approve", manifest, dropped: [], rejected: false };
    }
    const { kept, dropped } = dropLowConviction(manifest, threshold);
    return { kind: "downsize", manifest: kept, dropped, rejected: false, threshold };
  }
  return { kind: "approve", manifest, dropped: [], rejected: false };
}

// ---------------------------------------------------------------------------
// Top-level orchestration
// ---------------------------------------------------------------------------

export async function runSelfImprovementRiskOfficer({ now = Date.now(), llmCall } = {}) {
  let manifest;
  try {
    manifest = readManifest();
  } catch (err) {
    return { ok: false, error: err.message };
  }

  if (!manifest || !Array.isArray(manifest.edits) || manifest.edits.length === 0) {
    const empty = {
      verdict: "approve",
      reason: "manifest is empty — nothing to review",
      raw: "",
      proposalCount: 0,
      droppedCount: 0,
    };
    writeVerdict(empty);
    return { ok: true, verdict: empty };
  }

  let systemPrompt;
  try {
    const raw = readFileSync(PROMPT_PATH, "utf8");
    const fmMatch = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
    systemPrompt = (fmMatch ? fmMatch[1] : raw).trim();
  } catch (err) {
    return { ok: false, error: `Failed to read risk-officer prompt: ${err.message}` };
  }

  const signals = detectSelfImprovementSignals({ now, projectRoot: PROJECT_ROOT }).signals;
  const touchedFiles = readTouchedFiles(manifest);
  const recentVerdicts = readRecentVerdicts();
  const userPayload = buildRiskOfficerUserPayload({
    manifest,
    signals,
    touchedFiles,
    recentVerdicts,
  });

  let rawReply = "";
  try {
    rawReply = await callRiskOfficerLlm({ systemPrompt, userPayload, llmCall });
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const parsed = parseRiskOfficerVerdict(rawReply);
  // The shared parser was built for trade-batch verdicts and validates
  // `downsizeFactor` (in 0..1). Our manifest version uses
  // `downsizeThreshold` instead, so we accept either field on `downsize`
  // verdicts when the parser returned null. Best-effort secondary parse:
  let normalised = parsed;
  if (!normalised) {
    try {
      const fenceless = rawReply.replace(/```(?:json)?/g, "").trim();
      const match = fenceless.match(/\{[\s\S]*\}/);
      if (match) {
        const obj = JSON.parse(match[0]);
        if (obj && ["approve", "downsize", "veto"].includes(obj.verdict)) {
          normalised = { verdict: obj.verdict, reason: String(obj.reason || ""), downsizeFactor: obj.downsizeFactor, downsizeThreshold: obj.downsizeThreshold };
        }
      }
    } catch {
      // ignore
    }
  }
  if (normalised && normalised.verdict === "downsize") {
    // Promote either field into the canonical downsizeThreshold knob the
    // manifest-aware applier consumes.
    if (!normalised.downsizeThreshold && Number.isFinite(Number(normalised.downsizeFactor))) {
      normalised.downsizeThreshold = Number(normalised.downsizeFactor);
    }
  }

  const verdict = normalised || {
    verdict: "approve",
    reason: "risk-officer reply was not valid JSON; defaulting to approve",
  };
  verdict.raw = rawReply.slice(0, 4000);
  verdict.proposalCount = manifest.edits.length;

  const applied = applyVerdictToManifest({ manifest, verdict });
  verdict.droppedCount = applied.dropped.length;
  verdict.droppedEditIds = applied.dropped.map((e) => e.id);
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
    editPaths: (manifest.edits || []).map((e) => e.path),
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
  const result = await runSelfImprovementRiskOfficer();
  if (!result.ok) {
    console.error(`[risk-officer-self-improvement] ${result.error}`);
    process.exit(2);
  }
  console.log(`[risk-officer-self-improvement] verdict=${result.verdict.verdict} dropped=${result.verdict.droppedCount}/${result.verdict.proposalCount}`);
  console.log(`reason: ${result.verdict.reason}`);
}
