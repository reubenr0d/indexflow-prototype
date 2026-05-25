#!/usr/bin/env node

// Builds `.agent-self-improvement/issue-context.json` from a GitHub issue
// before `issue-implementer` runs. Invoked by `.github/workflows/issue-implementer.yml`.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(process.env.PROJECT_ROOT || resolve(__dirname, ".."));
const OUT_PATH = resolve(PROJECT_ROOT, ".agent-self-improvement", "issue-context.json");

const TRIGGER_PREFIX = "/agent implement";

export function parseExtraInstructions(commentBody) {
  if (typeof commentBody !== "string") return "";
  const trimmed = commentBody.trim();
  if (!trimmed.toLowerCase().startsWith(TRIGGER_PREFIX)) return "";
  const rest = trimmed.slice(TRIGGER_PREFIX.length).trim();
  return rest;
}

export function findLatestImplementComment(comments) {
  if (!Array.isArray(comments)) return null;
  let latest = null;
  for (const c of comments) {
    const body = typeof c?.body === "string" ? c.body.trim() : "";
    if (!body.toLowerCase().startsWith(TRIGGER_PREFIX)) continue;
    latest = c;
  }
  return latest;
}

export function buildIssueContextPayload({
  issueNumber,
  issueView,
  commentsView,
  triggerCommentBody,
}) {
  const issue = issueView || {};
  const comments = Array.isArray(commentsView?.comments) ? commentsView.comments : [];
  const fromEnv = parseExtraInstructions(triggerCommentBody);
  const fromThread = findLatestImplementComment(comments);
  const extraInstructions =
    fromEnv ||
    (fromThread ? parseExtraInstructions(fromThread.body) : "");

  return {
    available: true,
    builtAt: new Date().toISOString(),
    issue: {
      number: Number(issueNumber),
      title: issue.title || "",
      body: issue.body || "",
      labels: (issue.labels || []).map((l) => (typeof l === "string" ? l : l?.name)).filter(Boolean),
      author: issue.author?.login || issue.author || null,
      url: issue.url || null,
      comments: comments.map((c) => ({
        id: c.id,
        author: c.author?.login || null,
        body: c.body || "",
        createdAt: c.createdAt || null,
      })),
    },
    extraInstructions,
  };
}

function ghJson(args) {
  const out = execFileSync("gh", args, {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    env: { ...process.env },
  });
  return JSON.parse(out || "{}");
}

export function buildIssueContextFromGh({
  issueNumber,
  triggerCommentBody,
  runner = ghJson,
} = {}) {
  const num = String(issueNumber || "").trim();
  if (!/^\d+$/.test(num)) {
    throw new Error(`Invalid issue number: ${JSON.stringify(issueNumber)}`);
  }
  const issueView = runner([
    "issue",
    "view",
    num,
    "--json",
    "title,body,labels,author,url",
  ]);
  const commentsView = runner([
    "issue",
    "view",
    num,
    "--comments",
    "--json",
    "comments",
  ]);
  return buildIssueContextPayload({
    issueNumber: num,
    issueView,
    commentsView,
    triggerCommentBody,
  });
}

const isCli =
  typeof process !== "undefined" &&
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  const issueNumber = process.argv[2] || process.env.ISSUE_NUMBER;
  const triggerCommentBody = process.env.GITHUB_EVENT_COMMENT_BODY || "";
  try {
    const payload = buildIssueContextFromGh({ issueNumber, triggerCommentBody });
    mkdirSync(dirname(OUT_PATH), { recursive: true });
    writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2) + "\n");
    console.log(`Wrote ${OUT_PATH} for issue #${payload.issue.number}`);
  } catch (err) {
    console.error(`[build-issue-context] ${err.message}`);
    process.exit(1);
  }
}
