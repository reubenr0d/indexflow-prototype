---
partner: iExec
canonical_handle: "@iEx_ec"
status: active
counterpart: TBD (TBD)
indexflow_lead: Reuben
last_touch: 2026-05-23
next_milestone: "Confirm @iEx_ec co-tweet for Fri Jun 12; scope iApp confidential-compute PoC for an IndexFlow agent"
next_milestone_date: 2026-06-09
co_branded_surfaces:
  x_calendar: 2026-06-12
  galxe_quest: TBD (Season 2 candidate)
  boost_action: TBD (Season 1 follow-up if budget permits)
  ecosystem_grant: not yet scoped
guilds_touched: [Engineers]
---

# iExec

## Why this partnership exists

iExec's confidential compute (TEE-backed iApps) is a precise fit for IndexFlow's agent framework. Today an operator plugs an AI agent into a vault via a markdown config (`docs/AGENTS_FRAMEWORK.md`, `agents/quality-matrix-manager.md`), but the agent's reasoning runs in whatever environment the operator chose — typically a host they fully trust. Running that same agent inside an iExec iApp moves the reasoning into a TEE and makes the agent verifiable and private at the same time: an investor can prove the agent ran the configured prompt unmodified without exposing the prompt itself or the intermediate reasoning. Within the Week 3 confidential-infra trinity, iExec covers the *Compute* leg — paired with Secret Network for *State* and Nox for *Signing*.

## Active campaigns

- 2026-06-12 (Fri thread) — `growth/drafts/2026-06-12-thread-iexec-confidential-agent.md`. Covers "run your agent in iExec confidential compute, post the signed result back to your basket." Replaces the previously-sketched 0G-vault-agent thread slot (the 0G content can still ship separately as a standalone follow-up). Co-tweet from `@iEx_ec` quoting the thread with one line on why confidential AI matters for autonomous financial agents.

## Open requests on both sides

**From them:**

- TBD — first confirmed touch needs to surface what iExec wants from IndexFlow (logo placement, ecosystem grant application, iApp template co-authoring).

**From us:**

- Co-tweet on Fri Jun 12 quoting the confidential-agent thread.
- Scope an iApp confidential-compute PoC for one of the existing trading agents. `quality-matrix-manager` is the most natural first candidate — already a standalone agent config, well-defined prompt surface, and the analyst's 8-category matrix is exactly the kind of reasoning chain that benefits most from TEE attestation.

## Future surfaces (Season 2+)

- Substack follow-up on verifiable AI inference for autonomous DeFi agents — pairs cleanly with the existing technical pillar on cross-chain coordination.
- New MCP server `apps/mcps/iexec-compute/` (mirroring the shape of `apps/mcps/0g-storage/`) so agents can route inference through iExec confidential compute as a hot-swappable backend without rewriting the agent config.
- Joint demo or YouTube walkthrough of the first IndexFlow agent running inside an iApp, post-PoC.
- Co-funded Boost.xyz Action: bonus rewards for the first operators to ship a basket whose agent runs in an iApp.

## Historical thread / contact log

- 2026-05-23 — partnership tracking system created in repo; Season 1 placement confirmed (Fri Jun 12 thread anchoring the *Compute* leg of the Week 3 confidential-infra trinity, replacing the previously-sketched 0G-vault-agent thread slot).
