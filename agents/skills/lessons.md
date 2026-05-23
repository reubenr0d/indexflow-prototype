# Lessons (Closed-Position Memory)

Your runner emits a post-mortem for every position it closes (auto-exit
rotation, PnL-band TP/SL, or LLM-judged close). Those entries land in
`agents/memory/<agent>/run-log.<network>.jsonl` under the `closedPositions[]`
field of each run, and the next run's system prompt automatically surfaces
the top wins and losses of the last 30 days in a `## Lessons` section.

## What a closed-position entry contains

```
{
  vault, assetId, ticker, side,            // long | short
  closedAt, closedReason,                  // e.g. "rank_swap: ...", "llm_judged: ..."
  closeJustification,                      // the justification string on close_position
  realizedPnlUsdc,                         // signed USDC 6-dec, may be null
  realizedPnlPctOfCollateral,              // Number, e.g. -0.062 = -6.2%
  holdHours,                               // (closedAt - matchingOpen.timestamp) / 3600s
  entryRunId, entryTimestamp,              // when the matching open_position fired
  entryJustification, entryTxHash          // the justification you wrote on the open
}
```

Realised PnL is hydrated from the open-position roster that the runner
already had to read for the auto-exit decision (`list_open_positions` /
`get_perp_capital_snapshot`). LLM-driven closes attach realised PnL only
if you fetched the roster earlier in the same turn — when you didn't,
the entry still records the entry/exit justifications + hold time, which
is useful even without a ranked PnL outcome.

## How to use the `## Lessons` block in your prompt

The block ranks closures by `realizedPnlPctOfCollateral`:

- **Wins**: top-3 winners, sorted descending. Read these as "this kind of
  thesis worked last time". If the same setup recurs today, leaning into a
  similar size + holding period is supported by evidence.
- **Losses**: top-3 losers, sorted ascending. Read these as "do not
  re-enter this thesis without a fresh signal". Pair with the churn-guard
  (`agents/memory/shared/recently-closed.<vault>.json`) when deciding whether
  the same ticker is even available to re-open within the cooldown window.

The lessons are PRIORS, not commands. Always favour the current Atlas /
Quality top-N + live news + matrix red-flags over a stale post-mortem.
Re-citing a winning entry justification verbatim should only happen
because the same setup is actually playing out again.
