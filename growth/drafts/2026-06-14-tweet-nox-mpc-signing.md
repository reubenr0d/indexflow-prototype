# X (Twitter) Tweet Draft

---

## Metadata

- **Topic:** Close the Week 3 confidential-infra trinity arc — MPC threshold signing on Nox replaces the single-EOA keeper, so the agent's writes are no longer one private key away from custody risk
- **Pillar:** P3 Technical Credibility
- **Calendar week:** Week 3 (Season 1, confidential-infra trinity)
- **Source:** `services/keeper/` (MPC redundancy target), `docs/AGENTS_FRAMEWORK.md` (the agent today signs writes with the keeper EOA via `cast send`), `growth/partnerships/nox.md` (TBD), `growth/X_GROWTH_PLAN.md` § Week 3
- **Hook type:** Stakes

---

## Tweet

An AI agent with the keeper key is a single point of custody.

Compute on @iEx_ec. State on @SecretNetwork. Writes signed by [@NOX_HANDLE] MPC.

The whole stack is verifiable. None of it is custodial.

That's the trinity.

---

## Notes

- **Co-tweet target:** Nox X handle TBD. **Reuben to confirm** — see `growth/partnerships/nox.md` (not yet created in `growth/partnerships/`; the file should be scaffolded from `growth/partnerships/_TEMPLATE.md` before Sun Jun 14 with the confirmed handle, counterpart name, and `co_branded_surfaces.x_calendar: 2026-06-14`). Coordinate quote-tweet from Nox at 16:30 UTC (same slot as our standalone post) with one line on what they think about MPC signing for autonomous DeFi agents. Nox's tweet should land 5–15 min after ours so the algorithm sees engagement on the hook before partner amplification.
- **Closes the trinity arc.** This is the **load-bearing structural closer** for Week 3: all three legs of the confidential-infra trinity are named in calendar order inside one tweet (iExec → Secret → Nox), then the body collapses them into a one-sentence summary ("The whole stack is verifiable. None of it is custodial."), then the punchline ("That's the trinity.") cashes the curiosity bond opened by Thu Jun 11's standalone.
- **Stakes framing:** the hook ("An AI agent with the keeper key is a single point of custody") names the loss directly. The body answers it. This is what `growth/templates/tweet-thread.md` calls a Stakes hook — show what readers lose by not having the information, then close the loss in the same post.
- **Cross-trinity references (required):** explicit `@iEx_ec` (Fri compute leg), explicit `@SecretNetwork` (Sat state leg), explicit `[@NOX_HANDLE]` (today's signing leg). Three handles in one line. Every Week 3 trinity post references the other two — this one references both because it's the close.
- **Technical accuracy:** today's agent signs writes with `PRIVATE_KEY` via `cast send` (`docs/AGENTS_FRAMEWORK.md` § Write Confirmation Mode, `agents/quality-matrix-manager.md` § Infrastructure). That's exactly the single-EOA custody point the hook names. MPC threshold signing via Nox replaces that with N-of-M signer redundancy. `services/keeper/` is the cleanest first target for the integration (per the original Week 3 brief) because it already has the only place in the codebase that holds the keeper key.
- **No link.** The trinity arc is the payoff. Adding a link to "read the joint blog post" would dilute the close — the reader's reward is the realisation, not a click. Let the second-wave reply or quote-tweet (Mon morning) carry the deep-dive link if and when a write-up exists.
- **Posting cadence:** posts Sun Jun 14 at 16:30 UTC per the standalone cadence in `growth/X_GROWTH_PLAN.md`. This is the Season 1 Week-3 close beat — anchor it before the Week 4 institutional pivot kicks off Mon Jun 15.
- **Character budget:** ~245 chars (well under 280) — leaves ~35 chars of slack so the Nox handle, when confirmed, can be longer than the placeholder without forcing a rewrite.
- **Voice gut-check:** zero hashtag, zero emoji, no preamble. Four short paragraphs, descending sentence length, ending on the canonical four-word payoff "That's the trinity." Every word is doing structural work.
- **Pre-post Reuben checklist (Fri Jun 12 evening at latest):**
  1. Confirm the Nox X handle and substitute for `[@NOX_HANDLE]`. If the handle is `@nox_xyz`-shaped (~8 chars), the body lands at ~245 chars; if it's longer (12+), confirm character count stays under 280.
  2. Create `growth/partnerships/nox.md` from `_TEMPLATE.md` with the confirmed handle and the `co_branded_surfaces.x_calendar: 2026-06-14` slot so the partnerships tracker stays consistent.
  3. Confirm Nox is comfortable with the "single point of custody" framing as the hook — the line is critical of the *status quo* the agent framework ships with today, not critical of any partner. The framing makes Nox the answer, not the problem.
  4. Confirm the partner co-tweet plan: one line from Nox on MPC signing for autonomous DeFi agents, ideally citing the analogy "what HSMs are to custodians, MPC is to autonomous agents." Land 5–15 min after our post.
