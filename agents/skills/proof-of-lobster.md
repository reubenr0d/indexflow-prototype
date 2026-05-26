# Proof of Lobster Skill

Receipt-emitting skill convention for trading agents that run on the [Theseus](https://theseuschain.com/) runtime. Mirrors the upstream [Theseus `proof-of-lobster`](https://github.com/Theseuschain/proof-of-lobster) skill convention so a single agent markdown file is portable between repo-CI and Theseus runtimes.

## What this skill does

Replaces the repo's CI-pushed `paperclip-heartbeat.json` round-trip with a per-tick **signed onchain receipt** emitted by the Theseus runtime. Each receipt covers:

- `model` — which LLM produced the plan (provider, model id, version).
- `reasoning-verified` — boolean: did the runtime's mandate-check accept the plan?
- `plan` — the structured intent the agent decided on this tick.
- `mandate-check` — the second-pass verdict (`approve` / `downsize` / `veto`) and reason string. Sourced from [`agents/risk-officer.md`](risk-officer.md), ported inline.
- `sent` — the on-chain transaction hashes for any write actions in the tick.
- `finalized` — block hash + number when the receipt is finalized.

The receipt is signed by the agent's sovereign ICA (independent contract account) — the agent **holds its own key and balance**, no operator-held keeper key.

## Why the skill is named `proof-of-lobster`

The upstream Theseus convention. Naming it consistently means an agent markdown file authored against this skill file works against Theseus's own examples too, and any tooling Theseus ships (validators, indexers, dashboards) will recognise the receipt shape.

## Receipt shape (v1)

```yaml
receipt:
  schema: receipt.v1
  agentId: <theseus agent id>
  tick: <monotonic counter>
  model:
    provider: openai
    id: gpt-5-codex
    version: <version string>
  reasoning_verified: true
  plan:
    intent: open_position | close_position | wire_asset | set_vault_assets | allocate_to_perp
    args: { ... }
    justification: <free-form string>
  mandate_check:
    verdict: approve | downsize | veto
    reason: <free-form string>
    schema: receipt.mandate-check/v1
  sent:
    - txHash: 0x...
      chainId: <theseus chain id>
      blockNumber: <int>
  finalized:
    blockHash: 0x...
    blockNumber: <int>
    signedAt: <iso 8601 ts>
  signer: <agent ICA address>
  signature: 0x... (over the canonical hash of the above)
```

The `mandate_check` block is **mandatory**. A receipt without a `mandate_check.verdict` fails validation on the Theseus side and the tick is rejected.

## How an agent declares this skill

In the agent's markdown frontmatter:

```yaml
skills:
  - lessons          # standard repo skill, see agents/skills/lessons.md
  - proof-of-lobster # this file — emits receipts per tick on Theseus
```

The agent prompt body does not change. The runtime intercepts every write action, packs it into a `plan`, runs the inline `mandate-check`, emits the signed receipt, and only then submits the write. If the mandate-check returns `veto`, the write is dropped and the receipt records the veto reason.

## Mapping from today's risk-officer to the receipt mandate-check

The repo's [`agents/risk-officer.md`](risk-officer.md) is invoked by [`scripts/agent-runner-confirmation.mjs::runRiskOfficerPass`](../scripts/agent-runner-confirmation.mjs) as a synchronous per-batch LLM call. The verdict schema is identical to what `mandate_check` records — `approve` / `downsize` / `veto` + a reason string. Port-over is mechanical:

1. The same `risk-officer.md` system prompt is loaded by the Theseus runtime as the `mandateCheck` hook.
2. The runtime feeds it the agent's `plan` + recent market context (same shape as the current per-batch call).
3. The response is parsed into the `mandate_check` block of the receipt.
4. Downsize verdicts may rewrite the `plan` (e.g. cut size by 50%) before signing; veto verdicts drop the write entirely.

Net effect: the audit trail today (`paperclip-heartbeat.json` `riskOfficer` block per write action) becomes the on-chain `mandate_check` line per receipt. The reason text is the same string the founder reviews on `/ops` today.

## What this skill does NOT do

- It does not give the agent any new authority. The agent's `writeTools` list still binds what intents it can emit.
- It does not replace [`agents/risk-officer.md`](risk-officer.md). That file's prompt body is the source-of-truth; this skill just describes how the runtime hooks it in.
- It does not write to the repo. On Theseus, the agent's memory lives in the runtime; this repo only reads the receipt feed.

## Public visibility (`/ops`)

Once a Theseus-deployed agent ships, [`apps/web/src/app/ops/page.tsx`](../../apps/web/src/app/ops/page.tsx) gains a parallel data source: read the receipt feed for the Theseus agent ID (via Theseus's indexer / API) and render alongside the existing `AgentCard`s. The receipt's `txHash` deep-links into the basket page exactly like `paperclip-heartbeat.json` `writeActions[].txHash` does today.

## Blockers (must be unblocked before any agent declares this skill on a live run)

- [ ] Theseus runtime SDK reaches production-key readiness.
- [ ] Receipt indexer / API available for the `/ops` page to read.
- [ ] Mandate-check schema (`receipt.mandate-check/v1`) version-locked with Theseus founders.
- [ ] First agent (likely [`agents/mining-manager-theseus.md`](../mining-manager-theseus.md)) gets the green light from the founder for a testnet pilot.

Until then this file documents the planned shape and serves as a skill-target for `mining-manager-theseus.md` so the agent's frontmatter type-checks against `proof-of-lobster` even though no live receipts are flowing yet.
