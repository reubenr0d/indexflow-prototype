// Pure helpers for validating manifest-style search/replace edits against
// in-memory file contents. Extracted so both the MCP propose handler
// (`apps/mcps/repo-editor/index.js::propose_file_edit`) and the
// post-risk-officer applier
// (`scripts/apply-self-improvement-proposals.mjs::applyEditsToWorkingTree`)
// share the same invariant: every `search` must be present AND unique in
// the scratch buffer at the moment its replacement runs.
//
// Why a shared module instead of two copies:
//
// The MCP previously validated each new `propose_file_edit` against the
// raw on-disk file, but the applier applies the manifest's `edits[]`
// SEQUENTIALLY against the (mutating) working tree. So if edit A and
// edit B in the same manifest touch the same file and A perturbs the
// region B's `search` covers, B passed propose-time but failed
// apply-time with `SEARCH_NOT_FOUND` — and the only place the operator
// found out was at PR-open time, after the LLM costs and risk-officer
// turn were already spent. Pulling the apply-time semantics into the
// MCP propose path closes that gap.
//
// Keep this module pure — no IO, no shell-outs — so unit tests can
// drive it without spawning anything.

// Returns either { ok: true, newContents } or
// { ok: false, error_code, message }. Applies every `replacement` in
// order against `contents`, requiring each `search` to be present AND
// unique in the scratch buffer at the moment its replacement runs.
// Mirrors the original `previewReplaceEdit` from
// `scripts/apply-self-improvement-proposals.mjs`.
export function previewReplaceEdit({ filePath, contents, replacements }) {
  let scratch = contents;
  for (let i = 0; i < (replacements || []).length; i++) {
    const r = replacements[i];
    const idx = scratch.indexOf(r.search);
    if (idx === -1) {
      return {
        ok: false,
        error_code: "SEARCH_NOT_FOUND",
        message: `Replacement #${i + 1} \`search\` not found in ${filePath}`,
        replacementIndex: i,
      };
    }
    const before = scratch.slice(0, idx);
    const after = scratch.slice(idx + r.search.length);
    if (after.indexOf(r.search) !== -1) {
      return {
        ok: false,
        error_code: "SEARCH_AMBIGUOUS",
        message: `Replacement #${i + 1} \`search\` appears more than once in ${filePath}`,
        replacementIndex: i,
      };
    }
    scratch = before + r.replace + after;
  }
  return { ok: true, newContents: scratch };
}

// Replay every prior replace-edit in `manifest` whose `path` matches
// `targetPath`, in manifest order, against `baseContents`. Returns
// either { ok: true, scratch } (the post-replay buffer ready for the
// next proposed edit to validate against) or { ok: false, error_code,
// message, offendingEditId } when a prior edit no longer applies —
// which means the manifest is corrupt and the new edit should be
// refused so the agent stops stacking bad edits on a drifted file.
//
// Why: `propose_file_edit` in the MCP needs to know "if I were to
// apply all prior edits to this file and THEN apply this new one,
// would the new one's search still match?". Without this, two edits
// against the same file can pass propose-time and fail apply-time.
export function replayPriorEdits({ manifest, targetPath, baseContents }) {
  const edits = (manifest && Array.isArray(manifest.edits)) ? manifest.edits : [];
  let scratch = baseContents;
  for (const e of edits) {
    if (!e || e.kind !== "replace") continue;
    if (e.path !== targetPath) continue;
    const preview = previewReplaceEdit({
      filePath: targetPath,
      contents: scratch,
      replacements: e.replacements || [],
    });
    if (!preview.ok) {
      return {
        ok: false,
        error_code: "PRIOR_EDIT_REPLAY_FAILED",
        message: `Prior manifest edit ${e.id || "<unknown>"} no longer applies to ${targetPath}: ${preview.message}`,
        offendingEditId: e.id || null,
        underlying: preview,
      };
    }
    scratch = preview.newContents;
  }
  return { ok: true, scratch };
}
