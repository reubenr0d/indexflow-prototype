# X (Twitter) Thread Draft

---

## Metadata

- **Topic:** Plug an AI agent into a testnet basket vault using a single markdown file
- **Pillar:** P3 Technical Credibility + P4 Operator Stories
- **Calendar week:** Week 3 (Season 1, confidential-infra trinity) — **polished, post-ready Jun 8 @ 15:00 UTC**
- **Source:** `docs/AGENTS_FRAMEWORK.md`, `agents/quality-matrix-manager.md`, `agents/skills/`, `apps/mcps/`, `scripts/agent-runner.mjs`
- **Hook type:** Curiosity Gap

---

## Thread (10 tweets)

### Tweet 1 -- Hook

An AI agent managing a real vault should be easy to read.

One file says what the agent believes, what it is allowed to do, and where every decision gets recorded.

Point it at a testnet basket. The agent acts. The receipts go to git.

Here's the whole stack.

### Tweet 2

Open `agents/quality-matrix-manager.md`.

The first few lines tell the runner what the agent is allowed to do: which tools it can touch, how cautious it should be, and how much capital it can move.

No JavaScript. No framework boilerplate.

### Tweet 3

The rest of the file is the playbook.

Role. Strategy. Risk rules. What to do when the market changes.

The final section is the heartbeat: the recurring instruction that starts each scheduled run.

That's it. One readable file per agent.

### Tweet 4

Tools are plugged in by name.

One tool reads and writes vault state. One fetches market data. One scores mining companies.

To give an agent a new skill, you add a new tool. The agent file stays readable.

### Tweet 5

The runner is the translator.

It reads the agent file, checks the vault, pulls recent history, gives the agent its tools, and asks it what to do next.

Same runner for every agent. The difference is the playbook.

### Tweet 6

Memory is git.

Each agent keeps a small state file and a run-log.

After every scheduled run, the result is committed back to the repo.

No hidden dashboard. No private notebook. The audit trail is the product.

### Tweet 7

When the agent opens, closes, or updates a position, it is a real transaction with a real tx hash.

That hash goes straight into the run-log next to the reason for the decision.

The agent does not just say what it would do. It leaves receipts for what it did.

### Tweet 8

Before an agent can move capital, it runs in rehearsal mode.

It reads the vault, forms a decision, and writes the reasoning to the log — but no transaction is sent.

Every new agent has to prove it can think clearly before it gets permission to act.

### Tweet 9

Run an agent against a testnet basket during Season 1 and you earn Engineer-tier points, a Boost.xyz USDC payout, and mainnet whitelist priority.

The bar is simple: one vault, one agent file, one public run-log.

### Tweet 10 -- CTA

Agent-run vaults need three things: verifiable decisions, private compute, non-custodial signing.

Tomorrow: run-log receipt.

Fri: iExec.
Sat: Secret.
Sun: Nox MPC.

Docs: https://indexflow.app/docs/agents-framework?utm_source=x&utm_campaign=plug-your-agent-w3

---

## Standalone Tweets (extract 3-5 from thread)

1. An AI agent managing a real vault should be easy to read. One file says what the agent believes, what it can do, and where every decision gets recorded.

2. Memory is git. Each agent keeps a small state file and a run-log. After every scheduled run, the result is committed back to the repo. The audit trail is the product.

3. Tools are plugged in by name. One reads the vault, one fetches market data, one scores companies. To give an agent a new skill, add a new tool. The agent file stays readable.

4. Before an agent can move capital, it runs in rehearsal mode. It reads the vault, forms a decision, writes the reasoning to the log, and sends no transaction.

5. One runner, many agents. The runner reads the playbook, checks the vault, gives the agent its tools, and records what happened. The difference between agents is the playbook.

---

## Notes

- This is the **Engineers Guild headline thread** that anchors Week 3 (Track C activation).
- Posts Mon Jun 8 at 15:00 UTC per the channel cadence in `growth/X_GROWTH_PLAN.md`.
- Tweet 5 is a candidate for [IMAGE: `scripts/agent-runner.mjs` architecture diagram — markdown → runner → MCP servers + LLM → on-chain writes → run-log → git commit]. Visual tweets get ~150% more engagement.
- Tweet 10 CTA link should resolve to (a) the `docs/AGENTS_FRAMEWORK.md` page on the live docs site once published, with `agents/quality-matrix-manager.md` linked inline as the canonical example, OR (b) the GitHub permalink to `agents/quality-matrix-manager.md` if the docs route isn't live by Mon Jun 8. Either way, the link carries `utm_source=x&utm_campaign=plug-your-agent-w3`.
- Trinity foreshadow lives in Tweet 7 (Nox tease) and Tweet 10 (full trinity preview). Both are essential — Tweet 10 sets up the rest of the week's reads.
- Voice gut-check: zero emoji, zero hashtags, no "thread on…", no "so…". "Smart colleague at a conference."
- Quote-tweet the hook with one line ("Memory is git. Every decision auditable from `git log`.") at ~17:30 UTC for the second-wave bump described in `growth/templates/tweet-thread.md`.
