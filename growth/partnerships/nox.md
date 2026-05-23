---
partner: Nox
canonical_handle: "@nox_TBD"
status: active
counterpart: TBD (TBD)
indexflow_lead: Reuben
last_touch: 2026-05-23
next_milestone: "Confirm Nox canonical X handle + co-tweet timing for Sun Jun 14"
next_milestone_date: 2026-06-11
co_branded_surfaces:
  x_calendar: 2026-06-14
  galxe_quest: TBD (Season 2 candidate)
  boost_action: TBD (Season 1 follow-up if budget permits)
  ecosystem_grant: not yet scoped
guilds_touched: [Engineers, Cross-Chain Couriers]
---

# Nox

## Why this partnership exists

Nox provides MPC / threshold-signing infrastructure — the missing piece in IndexFlow's Week 3 confidential-infra trinity. The arc the trinity tells is: compute on iExec, state on Secret, writes signed by Nox MPC — none of it custodial. Beyond the narrative, Nox is a direct fit for a concrete production gap: the repo `README.md` Mainnet Readiness TODO lists "Keeper redundancy (at least 2 independent operators)" as an outstanding blocker for `services/keeper/`, and MPC threshold signing is the standard way to lift that line without re-architecting the keeper as a custom multi-keeper consensus protocol. The same primitive that unlocks the confidential-infra story for Season 1 also unblocks the mainnet readiness story for Season 2.

## Active campaigns

- 2026-06-14 (Sun standalone) — `growth/drafts/2026-06-14-tweet-nox-mpc-signing.md`. Closes the trinity narrative: "compute on iExec, state on Secret, writes signed by Nox MPC — none of it is custodial." Co-tweet from the Nox handle (placeholder `@nox_TBD` until Reuben confirms the canonical handle) quoting our standalone with one line on why MPC signing belongs in the same architectural conversation as confidential compute and confidential state.

## Open requests on both sides

**From them:**

- TBD — first confirmed touch needs to surface what Nox wants from IndexFlow (logo placement, ecosystem grant application, scope of a keeper signing integration).

**From us:**

- Confirm canonical Nox X handle (Reuben to provide; this file currently uses `@nox_TBD` as a placeholder so the slot date and routing are still trackable).
- Co-tweet on Sun Jun 14 quoting the trinity-closing standalone.
- Scope a keeper signing redundancy integration into `services/keeper/` — replaces the single-EOA signer with a Nox MPC threshold scheme, directly clearing the "at least 2 independent operators" line on the Mainnet Readiness TODO in `README.md`.

## Future surfaces (Season 2+)

- Keeper signing redundancy integration into `services/keeper/` — the concrete engineering item the Sun Jun 14 standalone lays the groundwork for.
- Joint thread: "Why your DeFi keeper shouldn't be a single EOA" — pairs the keeper signing redundancy story with the broader operator-grade DeFi keeper argument; doubles as an Engineer Guild recruiting surface.
- Post-mainnet co-marketing thread on the full production stack: iExec compute + Secret state + Nox MPC signing, with the IndexFlow keeper as the worked example of all three composed.
- Co-funded Boost.xyz Action: bonus rewards for operators who run a signing redundancy PoC against the testnet keeper, with Nox covering part of the USDC pool.

## Historical thread / contact log

- 2026-05-23 — partnership tracking system created in repo; Season 1 placement confirmed (Sun Jun 14 standalone closing the Week 3 confidential-infra trinity; canonical X handle still pending Reuben confirmation).
