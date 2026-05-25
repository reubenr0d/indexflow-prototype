#!/usr/bin/env node

// Posts a single summary comment on a GitHub issue after issue-implementer CI
// finishes (PR opened, vetoed, or no edits).

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(process.env.PROJECT_ROOT || resolve(__dirname, ".."));
const VERDICT_PATH = resolve(PROJECT_ROOT, ".agent-self-improvement", "risk-officer-verdict.json");
const MANIFEST_PATH = resolve(PROJECT_ROOT, ".agent-self-improvement", "proposed-edits.json");
const LAST_PR_URL_PATH = resolve(PROJECT_ROOT, ".agent-self-improvement", "last-pr-url.txt");

function readJsonOrNull(p) {
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

export function buildReplyBody({
  issueNumber,
  verdict,
  manifest,
  prUrl,
  reusedPr,
}) {
  const n = issueNumber;
  if (verdict?.verdict === "veto") {
    return [
      `**Issue implementer** — risk officer **vetoed** issue #${n}. No PR opened.`,
      "",
      `> ${verdict.reason || "No reason provided."}`,
      "",
      "Edit the issue or add a new `/agent implement` comment with clearer scope and try again.",
    ].join("\n");
  }

  const editCount = Array.isArray(manifest?.edits) ? manifest.edits.length : 0;
  if (!prUrl && editCount === 0) {
    return [
      `**Issue implementer** — no proposed edits for issue #${n}. Nothing to implement.`,
      "",
      "Add more detail to the issue or steer with `/agent implement <instructions>`.",
    ].join("\n");
  }

  if (!prUrl) {
    return [
      `**Issue implementer** — run finished for issue #${n} but no PR was opened.`,
      "",
      verdict
        ? `Risk officer verdict: \`${verdict.verdict}\` — ${verdict.reason || "see workflow logs."}`
        : "Check the workflow logs for details.",
    ].join("\n");
  }

  const verb = reusedPr ? "Updated" : "Opened";
  return [
    `**Issue implementer** — ${verb} draft PR for issue #${n}: ${prUrl}`,
    "",
    "Review and merge when ready. To revise the implementation, comment `/agent implement` with new instructions — the same PR branch will be force-pushed.",
  ].join("\n");
}

function ghIssueComment(issueNumber, body) {
  execFileSync(
    "gh",
    ["issue", "comment", String(issueNumber), "--body", body],
    { cwd: PROJECT_ROOT, encoding: "utf8", env: { ...process.env } },
  );
}

const isCli =
  typeof process !== "undefined" &&
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  const issueNumber = process.argv[2] || process.env.ISSUE_NUMBER;
  if (!issueNumber) {
    console.error("Usage: node scripts/post-issue-implementer-reply.mjs <issue-number>");
    process.exit(2);
  }
  const verdict = readJsonOrNull(VERDICT_PATH);
  const manifest = readJsonOrNull(MANIFEST_PATH);
  const prUrl = existsSync(LAST_PR_URL_PATH)
    ? readFileSync(LAST_PR_URL_PATH, "utf8").trim()
    : "";
  const reusedPr = process.env.AGENT_PR_REUSED === "1";
  const body = buildReplyBody({
    issueNumber,
    verdict,
    manifest,
    prUrl: prUrl || null,
    reusedPr,
  });
  try {
    ghIssueComment(issueNumber, body);
    console.log(`Posted reply on issue #${issueNumber}`);
  } catch (err) {
    console.error(`[post-issue-implementer-reply] ${err.message}`);
    process.exit(1);
  }
}
