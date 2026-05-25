import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  parseExtraInstructions,
  findLatestImplementComment,
  buildIssueContextPayload,
} from "./build-issue-context.mjs";

test("parseExtraInstructions strips /agent implement prefix and trailing text", () => {
  assert.equal(
    parseExtraInstructions("/agent implement focus on agents/foo.md only"),
    "focus on agents/foo.md only",
  );
  assert.equal(parseExtraInstructions("/agent implement"), "");
  assert.equal(parseExtraInstructions("not a trigger"), "");
});

test("findLatestImplementComment returns the last /agent implement comment", () => {
  const comments = [
    { id: 1, body: "/agent implement first pass" },
    { id: 2, body: "human note" },
    { id: 3, body: "/agent implement revise: skip tests" },
  ];
  assert.equal(findLatestImplementComment(comments)?.id, 3);
});

test("buildIssueContextPayload shapes issue + comments + extraInstructions", () => {
  const payload = buildIssueContextPayload({
    issueNumber: "17",
    issueView: {
      title: "agent: tighten metals gate",
      body: "## Summary\nDo X",
      labels: [{ name: "agent-finding" }],
      author: { login: "human" },
      url: "https://github.com/o/r/issues/17",
    },
    commentsView: {
      comments: [{ id: 9, author: { login: "human" }, body: "/agent implement only agents/foo.md", createdAt: "2026-05-26T00:00:00Z" }],
    },
    triggerCommentBody: "/agent implement only agents/foo.md",
  });
  assert.equal(payload.available, true);
  assert.equal(payload.issue.number, 17);
  assert.equal(payload.issue.title, "agent: tighten metals gate");
  assert.equal(payload.issue.comments.length, 1);
  assert.equal(payload.extraInstructions, "only agents/foo.md");
});
