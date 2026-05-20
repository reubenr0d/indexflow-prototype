import test from "node:test";
import assert from "node:assert/strict";
import { __agentRunnerInternals } from "./agent-runner.mjs";

const {
  parseRetryAfterHeader,
  parseRetryHintFromBody,
  computeRetryWaitMs,
  RETRY_BASE_MS,
  RETRY_MAX_MS,
  RETRY_HINT_PAD_MS,
} = __agentRunnerInternals;

test("parseRetryAfterHeader treats integer seconds as ms", () => {
  assert.equal(parseRetryAfterHeader("3"), 3000);
  assert.equal(parseRetryAfterHeader("0"), 0);
  assert.equal(parseRetryAfterHeader("  7 "), 7000);
});

test("parseRetryAfterHeader treats fractional seconds as ms", () => {
  assert.equal(parseRetryAfterHeader("1.913"), 1913);
});

test("parseRetryAfterHeader returns positive ms for future HTTP-date", () => {
  const now = Date.UTC(2026, 9, 21, 7, 28, 0); // 2026-10-21T07:28:00Z
  const headerValue = "Wed, 21 Oct 2026 07:28:30 GMT";
  const ms = parseRetryAfterHeader(headerValue, now);
  assert.equal(ms, 30_000);
});

test("parseRetryAfterHeader returns 0 for past HTTP-date (no negative sleep)", () => {
  const now = Date.UTC(2026, 9, 21, 7, 30, 0);
  const headerValue = "Wed, 21 Oct 2026 07:28:00 GMT";
  assert.equal(parseRetryAfterHeader(headerValue, now), 0);
});

test("parseRetryAfterHeader returns null for null/empty/garbage input", () => {
  assert.equal(parseRetryAfterHeader(null), null);
  assert.equal(parseRetryAfterHeader(undefined), null);
  assert.equal(parseRetryAfterHeader(""), null);
  assert.equal(parseRetryAfterHeader("   "), null);
  assert.equal(parseRetryAfterHeader("not-a-date-or-number"), null);
});

test("parseRetryHintFromBody parses fractional seconds (OpenAI TPM message)", () => {
  const body =
    'Rate limit reached for gpt-4o on tokens per min (TPM). Please try again in 1.913s. Visit ...';
  assert.equal(parseRetryHintFromBody(body), 1913);
});

test("parseRetryHintFromBody parses millisecond hint", () => {
  assert.equal(
    parseRetryHintFromBody("Rate limited; please try again in 250ms."),
    250
  );
});

test("parseRetryHintFromBody parses integer-second hint", () => {
  assert.equal(
    parseRetryHintFromBody("Slow down. Try again in 4s."),
    4000
  );
});

test("parseRetryHintFromBody returns null when no hint present", () => {
  assert.equal(parseRetryHintFromBody(""), null);
  assert.equal(parseRetryHintFromBody(null), null);
  assert.equal(parseRetryHintFromBody("Unrelated error message"), null);
});

test("computeRetryWaitMs prefers Retry-After header over body hint for 429", () => {
  const ms = computeRetryWaitMs({
    status: 429,
    retryAfterHeader: "2",
    errorBodyText: "try again in 10s",
    attempt: 0,
    random: () => 0,
  });
  assert.equal(ms, 2000 + RETRY_HINT_PAD_MS);
});

test("computeRetryWaitMs falls back to body hint when no header (429)", () => {
  const ms = computeRetryWaitMs({
    status: 429,
    retryAfterHeader: null,
    errorBodyText: "Rate limit; please try again in 1.913s.",
    attempt: 0,
    random: () => 0,
  });
  assert.equal(ms, 1913 + RETRY_HINT_PAD_MS);
});

test("computeRetryWaitMs uses exponential-with-jitter for 5xx (no hint)", () => {
  // attempt=2, random=0 → minimum jitter: returns baseMs.
  const minWait = computeRetryWaitMs({
    status: 500,
    retryAfterHeader: null,
    errorBodyText: null,
    attempt: 2,
    random: () => 0,
  });
  // attempt=2, random=1 → maximum jitter: returns baseMs * 2^attempt.
  const maxWait = computeRetryWaitMs({
    status: 500,
    retryAfterHeader: null,
    errorBodyText: null,
    attempt: 2,
    random: () => 0.999999,
  });
  assert.equal(minWait, RETRY_BASE_MS);
  assert.ok(
    maxWait <= RETRY_BASE_MS * 4 && maxWait >= RETRY_BASE_MS,
    `expected jittered wait in [${RETRY_BASE_MS}, ${RETRY_BASE_MS * 4}], got ${maxWait}`
  );
});

test("computeRetryWaitMs ignores hints for non-429 statuses", () => {
  const ms = computeRetryWaitMs({
    status: 503,
    retryAfterHeader: "30",
    errorBodyText: "try again in 30s",
    attempt: 0,
    random: () => 0,
  });
  // Non-429 path uses exponential-with-jitter, so 30s hint is ignored.
  assert.equal(ms, RETRY_BASE_MS);
});

test("computeRetryWaitMs clamps absurd hints to RETRY_MAX_MS", () => {
  const ms = computeRetryWaitMs({
    status: 429,
    retryAfterHeader: "9999",
    errorBodyText: null,
    attempt: 0,
  });
  assert.equal(ms, RETRY_MAX_MS);
});

test("computeRetryWaitMs never returns negative values", () => {
  const ms = computeRetryWaitMs({
    status: 429,
    retryAfterHeader: "-5",
    errorBodyText: null,
    attempt: 0,
    random: () => 0,
  });
  assert.ok(ms >= 0, `expected non-negative wait, got ${ms}`);
});

test("computeRetryWaitMs handles attempt=0 with no hint as baseMs", () => {
  const ms = computeRetryWaitMs({
    status: 500,
    retryAfterHeader: null,
    errorBodyText: null,
    attempt: 0,
    random: () => 0.5,
  });
  // expCap = baseMs * 2^0 = baseMs, so jittered range collapses to baseMs.
  assert.equal(ms, RETRY_BASE_MS);
});
