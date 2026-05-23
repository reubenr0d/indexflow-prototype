// Pure helpers for the proposal manifest at
// `.agent-self-improvement/proposed-edits.json`. Extracted from the MCP
// server so they can be unit-tested directly (no stdio, no spawn).
//
// Manifest shape (versioned so the applier can detect a stale layout):
//
//   {
//     version: 1,
//     createdAt: ISO,
//     updatedAt: ISO,
//     agent: "self-improver",
//     edits: [
//       {
//         id: <stable-hash>,
//         kind: "replace" | "create" | "rename",
//         path: <repo-relative POSIX path>,
//         requiresReviewKind: null | "runner" | "mcp" | "shared",
//         convictionWeight: number in [0,1],
//         justification: string,
//         // for kind="replace":
//         replacements: [{ search, replace }],
//         // for kind="create":
//         contents: string,
//         // for kind="rename":
//         newPath: string,
//         createdAt: ISO,
//       },
//       ...
//     ],
//   }
//
// Two invariants the manifest enforces (so the applier can trust the data):
//   * No two edits target the same path-and-replacement pair (dedupe by id).
//   * convictionWeight is clamped to [0,1] on insert.

import { createHash } from "node:crypto";

export const MANIFEST_VERSION = 1;

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

function shortHash(parts) {
  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex").slice(0, 12);
}

export function emptyManifest() {
  const ts = nowIso();
  return {
    version: MANIFEST_VERSION,
    createdAt: ts,
    updatedAt: ts,
    agent: "self-improver",
    edits: [],
  };
}

// Returns the existing edit when the manifest already carries the same
// (kind, path, payload) entry; null otherwise. Used to dedupe identical
// proposals across loop turns.
export function findDuplicate(manifest, candidate) {
  if (!manifest || !Array.isArray(manifest.edits)) return null;
  for (const e of manifest.edits) {
    if (e.kind !== candidate.kind) continue;
    if (e.path !== candidate.path) continue;
    if (candidate.kind === "replace") {
      const aRe = JSON.stringify(e.replacements || []);
      const bRe = JSON.stringify(candidate.replacements || []);
      if (aRe === bRe) return e;
    } else if (candidate.kind === "create") {
      if (e.contents === candidate.contents) return e;
    } else if (candidate.kind === "rename") {
      if (e.newPath === candidate.newPath) return e;
    }
  }
  return null;
}

export function addReplaceEdit(manifest, { path, requiresReviewKind, replacements, justification, convictionWeight }) {
  if (!Array.isArray(replacements) || replacements.length === 0) {
    throw new Error("addReplaceEdit: replacements must be a non-empty array of { search, replace } objects");
  }
  for (const r of replacements) {
    if (!r || typeof r.search !== "string" || typeof r.replace !== "string") {
      throw new Error("addReplaceEdit: every replacement needs string `search` and `replace` fields");
    }
    if (r.search === r.replace) {
      throw new Error("addReplaceEdit: `search` and `replace` must differ (no-op edit)");
    }
  }
  const candidate = {
    kind: "replace",
    path,
    requiresReviewKind: requiresReviewKind || null,
    replacements: replacements.map((r) => ({ search: r.search, replace: r.replace })),
    justification: String(justification || "").slice(0, 4000),
    convictionWeight: clampConviction(convictionWeight ?? 0.6),
  };
  const dup = findDuplicate(manifest, candidate);
  if (dup) return { added: false, edit: dup };
  const id = shortHash([
    candidate.kind,
    candidate.path,
    ...candidate.replacements.map((r) => r.search + "→" + r.replace),
  ]);
  const edit = { id, createdAt: nowIso(), ...candidate };
  manifest.edits.push(edit);
  manifest.updatedAt = nowIso();
  return { added: true, edit };
}

export function addCreateEdit(manifest, { path, requiresReviewKind, contents, justification, convictionWeight }) {
  if (typeof contents !== "string" || contents.length === 0) {
    throw new Error("addCreateEdit: contents must be a non-empty string");
  }
  const candidate = {
    kind: "create",
    path,
    requiresReviewKind: requiresReviewKind || null,
    contents,
    justification: String(justification || "").slice(0, 4000),
    convictionWeight: clampConviction(convictionWeight ?? 0.6),
  };
  const dup = findDuplicate(manifest, candidate);
  if (dup) return { added: false, edit: dup };
  const id = shortHash([candidate.kind, candidate.path, candidate.contents.slice(0, 4000)]);
  const edit = { id, createdAt: nowIso(), ...candidate };
  manifest.edits.push(edit);
  manifest.updatedAt = nowIso();
  return { added: true, edit };
}

export function addRenameEdit(manifest, { path, newPath, requiresReviewKind, justification, convictionWeight }) {
  if (typeof newPath !== "string" || !newPath) {
    throw new Error("addRenameEdit: newPath must be a non-empty string");
  }
  if (path === newPath) {
    throw new Error("addRenameEdit: path and newPath must differ");
  }
  const candidate = {
    kind: "rename",
    path,
    newPath,
    requiresReviewKind: requiresReviewKind || null,
    justification: String(justification || "").slice(0, 4000),
    convictionWeight: clampConviction(convictionWeight ?? 0.6),
  };
  const dup = findDuplicate(manifest, candidate);
  if (dup) return { added: false, edit: dup };
  const id = shortHash([candidate.kind, candidate.path, candidate.newPath]);
  const edit = { id, createdAt: nowIso(), ...candidate };
  manifest.edits.push(edit);
  manifest.updatedAt = nowIso();
  return { added: true, edit };
}

// Returns the set of unique paths the manifest touches (for the "which
// agents got their .md edited" check the workflow's dry-run replay step
// uses).
export function listTouchedPaths(manifest) {
  const out = new Set();
  if (!manifest?.edits) return [];
  for (const e of manifest.edits) {
    out.add(e.path);
    if (e.kind === "rename" && e.newPath) out.add(e.newPath);
  }
  return Array.from(out).sort();
}

// Returns the names of every `agents/<name>.md` file the manifest edits.
// Used by the workflow's replay step to run a dry-run of each touched
// agent before opening the PR.
export function listTouchedAgents(manifest) {
  const out = new Set();
  if (!manifest?.edits) return [];
  for (const e of manifest.edits) {
    const m = e.path.match(/^agents\/([^/]+)\.md$/);
    if (m) out.add(m[1]);
  }
  return Array.from(out).sort();
}

// Drop edits whose convictionWeight is below `threshold`. Used by the
// risk-officer downsize verdict to keep only the highest-conviction
// items when the officer says "approve most of this but trim the
// weakest legs".
export function dropLowConviction(manifest, threshold) {
  const cutoff = Number(threshold);
  if (!Number.isFinite(cutoff)) return { kept: manifest, dropped: [] };
  const dropped = [];
  const kept = [];
  for (const e of manifest.edits || []) {
    if (e.convictionWeight < cutoff) dropped.push(e);
    else kept.push(e);
  }
  return {
    kept: { ...manifest, edits: kept, updatedAt: nowIso() },
    dropped,
  };
}
