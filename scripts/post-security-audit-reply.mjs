#!/usr/bin/env node

// Posts the security-auditor's final report as a PR comment (diff mode) or
// to the workflow step summary (full-repo mode, no PR to comment on).
// Invoked by `.github/workflows/security-audit.yml` after the agent runs.

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(process.env.PROJECT_ROOT || resolve(__dirname, ".."));

export function readLastRunLogSummary({ projectRoot, network }) {
  const filePath = resolve(projectRoot, "agents", "memory", "security-auditor", `run-log.${network}.jsonl`);
  if (!existsSync(filePath)) return null;
  const lines = readFileSync(filePath, "utf8").split("\n").filter((l) => l.trim());
  if (lines.length === 0) return null;
  try {
    const last = JSON.parse(lines[lines.length - 1]);
    return typeof last.summary === "string" ? last.summary : null;
  } catch {
    return null;
  }
}

function ghPrComment(prNumber, body) {
  execFileSync("gh", ["pr", "comment", String(prNumber), "--body", body], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    env: { ...process.env },
  });
}

const isCli =
  typeof process !== "undefined" &&
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  const network = process.env.AGENT_NETWORK || "audit";
  const prNumber = process.env.PR_NUMBER || "";

  const summary = readLastRunLogSummary({ projectRoot: PROJECT_ROOT, network });
  const body = summary && summary.trim().length > 0
    ? summary
    : "**Security auditor** — run finished but produced no report (check workflow logs for errors).";

  if (prNumber) {
    try {
      ghPrComment(prNumber, body);
      console.log(`Posted security audit comment on PR #${prNumber}`);
    } catch (err) {
      console.error(`[post-security-audit-reply] ${err.message}`);
      process.exit(1);
    }
  } else {
    const summaryFile = process.env.GITHUB_STEP_SUMMARY;
    if (summaryFile) {
      appendFileSync(summaryFile, `${body}\n`);
    }
    console.log(body);
  }
}
