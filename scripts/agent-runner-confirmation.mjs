export function parseToolCallArgs(rawArguments) {
  try {
    return JSON.parse(rawArguments ?? "{}");
  } catch {
    return {};
  }
}

export function getOriginalToolName(toolName) {
  return toolName.includes("/") ? toolName.split("/").slice(1).join("/") : toolName;
}

export function classifyToolCalls(toolCalls, writeTools) {
  const calls = (toolCalls || []).map((toolCall) => {
    const toolName = toolCall.function.name;
    const originalName = getOriginalToolName(toolName);
    const args = parseToolCallArgs(toolCall.function.arguments);
    const isWrite = writeTools.has(originalName);
    return { toolCall, toolName, originalName, args, isWrite };
  });

  return {
    calls,
    writeCalls: calls.filter((c) => c.isWrite),
    readCalls: calls.filter((c) => !c.isWrite),
    hasWriteCalls: calls.some((c) => c.isWrite),
  };
}

export function isInteractiveTty(stdin = process.stdin, stdout = process.stdout) {
  return Boolean(stdin?.isTTY && stdout?.isTTY);
}

export function shouldBypassWriteConfirmation({
  confirmWritesEnabled,
  dryRun,
  hasWriteCalls,
  interactiveTty,
  nonInteractiveWriteExecute,
}) {
  return (
    confirmWritesEnabled &&
    !dryRun &&
    hasWriteCalls &&
    !interactiveTty &&
    nonInteractiveWriteExecute
  );
}

export function shouldSkipWritesForNonInteractiveSession({
  confirmWritesEnabled,
  dryRun,
  hasWriteCalls,
  interactiveTty,
  nonInteractiveWriteExecute,
}) {
  return (
    confirmWritesEnabled &&
    !dryRun &&
    hasWriteCalls &&
    !interactiveTty &&
    !nonInteractiveWriteExecute
  );
}

// ---------------------------------------------------------------------------
// Risk-officer second-pass
// ---------------------------------------------------------------------------
//
// A non-MCP, prompt-only role that vets every proposed write batch before the
// runner broadcasts. Inspired by TradingAgents' "Risk Manager" loop and the
// virattt/ai-hedge-fund bull/bear/risk triad. The verdict is logged into
// `runSummary.writeActions[*].riskOfficer` so the web UI's action panel can
// surface "Risk officer downsized 50%: ..." next to the executed tx.
//
// Three verdicts:
//   - approve  — proceed with the batch as-is
//   - downsize — scale every open_position `collateral` (and proportionally
//                its `size`) by `downsizeFactor in (0, 1]`. Leverage is
//                preserved because `size / (collateral * 1e24) = leverage`.
//   - veto     — abort the batch with the supplied `reason`; the LLM gets
//                the reason as feedback the same way a manual reject would.

export const DEFAULT_RISK_OFFICER_SYSTEM_PROMPT = `You are the RISK OFFICER for an autonomous on-chain mining-stock vault.

Your job: vet every proposed batch of on-chain write calls BEFORE the runner broadcasts them. You are a SECOND opinion, not the primary decision maker — bias slightly conservative but do not block obviously sound trades.

You will be given:
- A JSON object with the proposed writeBatch (every tool call + args + justification).
- The live get_perp_capital_snapshot for the vault (idle / perp allocated / available collateral / open positions roster).
- The most recent closed-position post-mortems for the same vault (with realised PnL).
- Today's metals market regime tag (regime / shortPenalty / longBonus).

Reply with STRICT JSON, no preamble, no Markdown fences. The schema is:

  {
    "verdict": "approve" | "downsize" | "veto",
    "reason":  "<one-sentence rationale; cited concrete numbers when possible>",
    "downsizeFactor": <number in (0, 1] when verdict is downsize; omit otherwise>
  }

Guidelines:
- Approve when the batch is consistent with the vault's available collateral, the lessons block, and today's regime. Default to approve when in doubt.
- Downsize (factor 0.25 - 0.75) when a leg is over-sized vs availableCollateral (e.g. open_position collateral > 60% of availableCollateral on a single ticker), when conviction is borderline, or when the regime hints at squeeze risk on a short.
- Veto when the batch would:
  - re-open a ticker that the recent post-mortems show lost >10% on a previous close within the same window,
  - open a short with shortPenalty >= 2 (the runner blocks this anyway, but call it out for the audit log),
  - or stack new longs to >90% of availableCollateral on a single name.

Cite specific dollar amounts or percentages from the inputs in your reason. Reasoning length max ~200 chars; the reason is shown to operators in the UI.
`;

// Build the user-message JSON payload for the risk-officer call. Kept pure
// so tests can snapshot the exact shape we send to the LLM.
export function buildRiskOfficerUserPayload({
  writeBatch,
  vaultSnapshot,
  recentClosedPositions = [],
  marketRegime = null,
}) {
  return {
    writeBatch: (writeBatch || []).map((c) => ({
      tool: c.originalName || c.toolName,
      args: c.args || {},
      justification: c.args?.justification || null,
    })),
    vaultSnapshot: vaultSnapshot || null,
    recentClosedPositions: (recentClosedPositions || []).slice(0, 5),
    marketRegime: marketRegime
      ? {
          regime: marketRegime.regime,
          shortPenalty: marketRegime.shortPenalty,
          longBonus: marketRegime.longBonus,
          summary: marketRegime.summary,
        }
      : null,
  };
}

const _STRICT_JSON_BLOCK_RE = /\{[\s\S]*\}/;

// Parse the LLM's reply into a structured verdict. Returns `null` when the
// reply can't be parsed as JSON or fails schema validation. The caller
// defaults to `approve` on null so a malformed LLM reply never blocks a
// trade (the bug would be in the prompt, not in this batch).
export function parseRiskOfficerVerdict(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let parsed = null;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(_STRICT_JSON_BLOCK_RE);
    if (!match) return null;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const verdict = String(parsed.verdict || "").toLowerCase();
  if (!["approve", "downsize", "veto"].includes(verdict)) return null;
  const reason = String(parsed.reason || "").trim();
  const out = { verdict, reason };
  if (verdict === "downsize") {
    const factor = Number(parsed.downsizeFactor);
    if (!Number.isFinite(factor) || factor <= 0 || factor > 1) return null;
    out.downsizeFactor = factor;
  }
  return out;
}

// Apply a downsize factor to every open_position call in the batch. Mutates
// `args.collateral` (raw USDC, integer string) and `args.size` (GMX-USD,
// integer string) by the same factor so the effective leverage is unchanged.
// Returns `{ adjustedCalls, audit }` where `audit` is a per-call summary of
// the scaling for `runSummary.writeActions[].riskOfficer`.
export function applyRiskOfficerDownsize(writeCalls, downsizeFactor) {
  if (!Array.isArray(writeCalls) || writeCalls.length === 0) {
    return { adjustedCalls: [], audit: [] };
  }
  if (!Number.isFinite(downsizeFactor) || downsizeFactor <= 0 || downsizeFactor > 1) {
    return { adjustedCalls: writeCalls, audit: [] };
  }
  // Use 6 decimals of scaling precision (factor 0.123456 -> 123456 / 1e6).
  const SCALE = 1_000_000n;
  const numerator = BigInt(Math.round(downsizeFactor * Number(SCALE)));
  const audit = [];
  const adjustedCalls = writeCalls.map((call) => {
    const originalName = call.originalName || call.toolName;
    if (originalName !== "open_position") return call;
    const args = call.args || {};
    const beforeCollateral = String(args.collateral || "0");
    const beforeSize = String(args.size || "0");
    let afterCollateral = beforeCollateral;
    let afterSize = beforeSize;
    try {
      const colBn = BigInt(beforeCollateral);
      const sizBn = BigInt(beforeSize);
      const scaledCol = (colBn * numerator) / SCALE;
      const scaledSiz = (sizBn * numerator) / SCALE;
      // Refuse to scale to 0 — the on-chain call will revert and the
      // runner's INSUFFICIENT_COLLATERAL pre-flight would also catch it.
      if (scaledCol > 0n && scaledSiz > 0n) {
        afterCollateral = scaledCol.toString();
        afterSize = scaledSiz.toString();
        args.collateral = afterCollateral;
        args.size = afterSize;
      }
    } catch {
      // Non-integer args (e.g. LLM passed a number instead of a string).
      // Leave args untouched and record `skipped: true` so callers know.
      audit.push({
        tool: originalName,
        assetId: args.assetId || null,
        skipped: true,
        reason: "non-integer size/collateral",
      });
      return call;
    }
    audit.push({
      tool: originalName,
      assetId: args.assetId || null,
      isLong: args.isLong ?? null,
      beforeCollateral,
      afterCollateral,
      beforeSize,
      afterSize,
      downsizeFactor,
    });
    return call;
  });
  return { adjustedCalls, audit };
}

// Orchestrate one risk-officer pass. `llmCall(systemPrompt, userPrompt)`
// is injected so the agent-runner can pass its own retry-aware
// `chatCompletion` wrapper and unit tests can stub it.
//
// Returns `{ verdict, reason, downsizeFactor?, audit?, raw }` where:
//   - verdict: "approve" | "downsize" | "veto"
//   - raw:     the LLM's verbatim reply (for the audit log)
//   - audit:   per-call downsize summary when verdict === "downsize"
export async function runRiskOfficerPass({
  writeBatch,
  vaultSnapshot,
  recentClosedPositions = [],
  marketRegime = null,
  llmCall,
  systemPrompt = DEFAULT_RISK_OFFICER_SYSTEM_PROMPT,
}) {
  if (!Array.isArray(writeBatch) || writeBatch.length === 0) {
    return { verdict: "approve", reason: "no writes to review", raw: "" };
  }
  if (typeof llmCall !== "function") {
    return { verdict: "approve", reason: "no llmCall provided", raw: "" };
  }
  const userPayload = buildRiskOfficerUserPayload({
    writeBatch,
    vaultSnapshot,
    recentClosedPositions,
    marketRegime,
  });
  let raw = "";
  try {
    raw = await llmCall(systemPrompt, JSON.stringify(userPayload));
  } catch (err) {
    return {
      verdict: "approve",
      reason: `risk-officer LLM call failed: ${err?.message || err}`,
      raw: "",
    };
  }
  const parsed = parseRiskOfficerVerdict(raw);
  if (!parsed) {
    return {
      verdict: "approve",
      reason: "risk-officer reply was not valid JSON; defaulting to approve",
      raw,
    };
  }
  if (parsed.verdict === "downsize") {
    const { audit } = applyRiskOfficerDownsize(writeBatch, parsed.downsizeFactor);
    return { ...parsed, raw, audit };
  }
  return { ...parsed, raw };
}
