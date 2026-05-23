# X (Twitter) Thread Draft

---

## Metadata

- **Topic:** Point an IndexFlow agent at iExec's confidential compute (TEE / iApp) so the agent's reasoning is verifiable and private at the same time — *Compute* leg of the Week 3 confidential-infra trinity
- **Pillar:** P3 Technical Credibility
- **Calendar week:** Week 3 (Season 1, confidential-infra trinity)
- **Source:** `docs/AGENTS_FRAMEWORK.md`, `agents/quality-matrix-manager.md`, `growth/partnerships/iexec.md`, iExec confidential AI / iApp docs
- **Hook type:** Insider Knowledge

---

## Thread (9 tweets)

### Tweet 1 -- Hook

Your AI agent manages real money.

Why does its reasoning run on a server you don't control?

We pointed an IndexFlow agent at @iEx_ec's TEE. The agent's logic, prompt, and intermediate reasoning are now sealed inside an enclave that can attest to what it ran.

### Tweet 2

An IndexFlow agent today is a markdown file: system prompt + YAML config. The runner spawns MCP servers, calls an LLM, signs writes with the keeper key.

That LLM call is the soft spot. Whoever controls the inference endpoint controls what the agent "decided."

### Tweet 3

iExec's iApp model puts that inference inside a TEE.

You ship the model + the agent's prompt as an iApp. The TEE runs it, returns the result plus an attestation: a signed claim that the output was produced by this exact code on this exact input.

### Tweet 4

The composition is small.

In the agent file, `LLM_BASE_URL` points at an iExec iApp instead of `api.openai.com`. The runner's loop is unchanged. The reasoning + the action come back together. The attestation hash lands in the run-log next to the tx hash.

### Tweet 5

What the operator gets:

- The agent's system prompt stays private (the iApp executes it; nobody outside the TEE reads it).
- The output is signed by the enclave, not by an opaque inference provider.
- Every action in `run-log.<network>.jsonl` is provably the agent's, not someone else's.

### Tweet 6

What the LP gets:

A vault whose curator can't quietly swap the strategy mid-run. The TEE attestation hash committed alongside each run pins the inference to a specific iApp build.

If the operator changes the agent file, the attestation hash changes. Diff is visible from `git log`.

### Tweet 7

This matters specifically for basket vaults.

A basket curator is an operator running an agent on behalf of LPs. "Trust me, my agent is honest" is not an answer. "Here's the attestation, here's the run-log, here's the tx" is.

Verifiable AI inference for autonomous capital, in one stack.

### Tweet 8

Tomorrow: confidential state on @SecretNetwork — the curator's weighting stays private, the basket's NAV stays verifiable.

Sunday: MPC signing on Nox — the keeper key stops being a single EOA.

Three layers, one verifiable stack. Today's leg is compute.

### Tweet 9 -- CTA

The agent framework is open. The iExec integration is a 1-line `LLM_BASE_URL` swap once the iApp is published.

Joint write-up with @iEx_ec on what verifiable AI inference unlocks for DeFi vaults: [link with utm_source=x&utm_campaign=iexec-trinity]

---

## Standalone Tweets (extract 3-5 from thread)

1. Your AI agent manages real money. Why does its reasoning run on a server you don't control? An IndexFlow agent pointed at @iEx_ec's TEE produces a signed attestation alongside every on-chain action.

2. The integration is a 1-line swap. `LLM_BASE_URL` moves from `api.openai.com` to an iExec iApp. The runner loop is unchanged. The attestation hash lands in the run-log next to the tx hash.

3. A basket curator is an operator running an agent on behalf of LPs. "Trust me, my agent is honest" is not an answer. "Here's the attestation, here's the run-log, here's the tx" is.

4. If a curator silently swaps the strategy mid-run, the TEE attestation hash changes. The diff is visible from `git log`. That's what verifiable AI inference does for an autonomous vault.

5. The hardest part of running an AI-managed vault isn't the AI. It's proving the AI ran what you said it would. @iEx_ec confidential compute does that part in one signed claim per run.

---

## Notes

- **Co-tweet target:** `@iEx_ec`. Coordinate quote-tweet from iExec at 15:00 UTC (same slot as our thread post) with one line on what they think about verifiable AI in DeFi vaults. iExec's tweet should land 5–15 min after ours so the algorithm sees engagement on the hook before the partner amplification.
- **Cross-partner reference inside the thread:** Tweet 8 explicitly names `@SecretNetwork` (Sat) and Nox (Sun) so a reader who only catches the iExec thread still understands the trinity arc. This is the load-bearing structural choice for the week — every trinity post references the other two.
- **CTA link target:** the canonical link is the joint write-up co-authored with iExec (planned Substack issue per `growth/partnerships/iexec.md` § Future surfaces). If the write-up isn't published by Fri Jun 12, fall back to the Mon Jun 8 thread URL — that lands the reader inside the agent framework story without leaving X. Either way the link carries `utm_source=x&utm_campaign=iexec-trinity`.
- **PoC readiness check:** as of `growth/partnerships/iexec.md` (last_touch 2026-05-23), the iApp PoC is not yet shipped. The thread is written in present tense ("we pointed an IndexFlow agent at iExec's TEE") on the assumption that a minimum-viable PoC — even just `LLM_BASE_URL` pointing at a published iApp running the `quality-matrix-manager` prompt — is live by Fri Jun 12. **If the PoC slips, soften Tweet 1 to "We're pointing an IndexFlow agent at @iEx_ec's TEE" and rewrite Tweet 4 in future tense; flag in the diff so the slip is recoverable.**
- **Image candidate:** Tweet 4 carries a one-diagram opportunity — [IMAGE: `agent.md` → runner → iExec iApp (TEE) → signed attestation + LLM response → run-log entry with both `txHash` and `attestationHash`]. Visual tweets get ~150% more engagement and this is the most schematically interesting tweet in the thread.
- **Posting cadence:** thread posts Fri Jun 12 at 15:00 UTC per thread cadence. Quote-tweet the hook with a one-line summary at ~17:30 UTC.
- **Voice gut-check:** zero hashtag, zero emoji, no "thread on…". The word `enclave` appears once (Tweet 1) for the audience that knows what it means; every subsequent reference uses `TEE` so the thread reads cleanly without the term.
- **Trinity continuity check:** this thread does the *Compute* leg. The Sat post does *State* (references iExec + Nox). The Sun post does *Signing* (closes the arc, references iExec + Secret + Nox). All three are written so any one of them stands alone but a reader hitting two or three sees the full picture.
