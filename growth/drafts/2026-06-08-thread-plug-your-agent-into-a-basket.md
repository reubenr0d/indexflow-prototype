# X (Twitter) Thread Draft

---

## Metadata

- **Topic:** Plug an AI agent into a testnet basket vault using a single markdown file
- **Pillar:** P3 Technical Credibility + P4 Operator Stories
- **Calendar week:** Week 3 (Season 1, confidential-infra trinity)
- **Source:** `docs/AGENTS_FRAMEWORK.md`, `agents/quality-matrix-manager.md`, `agents/skills/`, `apps/mcps/`, `scripts/agent-runner.mjs`
- **Hook type:** Curiosity Gap

---

## Thread (10 tweets)

### Tweet 1 -- Hook

An AI agent managing a real DeFi vault should be a markdown file.

One file: system prompt at the top, YAML config at the bottom. Point it at a testnet basket. Markdown in, on-chain trades out, every decision committed to git.

Here's the whole stack.

### Tweet 2

Open `agents/quality-matrix-manager.md`. The frontmatter declares everything the runner needs to instantiate the agent:

`mcpServers`, `writeTools`, `maxTurns`, `temperature`, `entryMode`, `entryQualityScoreMin`, `maxNewPositionsPerRun`, `autoAllocateTargetBps`.

No JavaScript. No framework boilerplate.

### Tweet 3

The body below the `---` is the agent's soul. Identity, strategy, rules.

The `## User Prompt` section at the end is the heartbeat — the message that kicks off every scheduled run.

That's the whole authoring surface. Three sections, one file per agent.

### Tweet 4

Capabilities are MCP servers, registered once in `agents/mcp-servers.json` and referenced by name in the agent's frontmatter.

Today: `vault-manager-mcp` (on-chain reads + writes), `yfinance-mcp` (market data), `atlas-quality-mcp` (mining quality matrix). New capability = new MCP server.

### Tweet 5

`scripts/agent-runner.mjs` is the only glue. It parses the markdown, spawns the declared MCP servers, injects vault state + recent run history into the system prompt, and calls the LLM with the MCP tools attached.

Same runner for every agent. The diff between agents is the markdown.

### Tweet 6

Memory is git.

`agents/memory/<agent>/state.json` carries the vault address, deployment fingerprint, and current thesis. `run-log.<network>.jsonl` appends one structured line per run.

A `commit-results` job in the vault-agent workflow pushes both back to `main` after every tick.

### Tweet 7

Writes sign with the keeper key through `cast send`. Every `open_position`, `close_position`, `wire_asset` is a real transaction with a real tx hash threaded back into the run-log.

(Yes, that's a single EOA today. Sunday's tweet on Nox MPC signing is the answer to "but what about the EOA?")

### Tweet 8

Before any agent goes live, `AGENT_DRY_RUN=1` runs the full loop with writes blocked. The reasoning surface, the tool calls, and the proposed actions all land in the run-log — nothing touches the chain.

Every new agent earns the keeper key by passing dry-run first.

### Tweet 9

Run an agent against a testnet basket during Season 1 and you earn Engineer-tier points, a Boost.xyz USDC payout, and mainnet whitelist priority.

The bar is one vault, one agent file, one committed run-log.

### Tweet 10 -- CTA

The trinity that makes this verifiable, private, and non-custodial drops this week.

Tomorrow: a real run-log entry as a receipt. Fri: iExec confidential compute. Sat: Secret Network encrypted state. Sun: Nox MPC signing.

Agent docs + example file: [link with utm_source=x&utm_campaign=plug-your-agent-w3]

---

## Standalone Tweets (extract 3-5 from thread)

1. An AI agent managing a real DeFi vault should be a markdown file. System prompt at the top, YAML config at the bottom, run-log committed to git. That's the whole authoring surface.

2. Memory is git. `agents/memory/<agent>/state.json` carries the vault context. `run-log.<network>.jsonl` appends one structured line per run. CI pushes both back to `main` after every tick. Every decision is auditable from `git log`.

3. Capabilities are MCP servers, not framework plugins. Register the server once in `agents/mcp-servers.json`, reference it by name in any agent's frontmatter. New capability = new server, same agent format.

4. Before any agent earns the keeper key it has to pass `AGENT_DRY_RUN=1`. The full loop runs, reasoning surfaces in the run-log, nothing touches the chain. Dry-run is the gate.

5. One runner, many agents. `scripts/agent-runner.mjs` parses the markdown, spawns MCP servers, injects vault state, calls the LLM. The only thing that differs between agents is the markdown file.

---

## Notes

- This is the **Engineers Guild headline thread** that anchors Week 3 (Track C activation).
- Posts Mon Jun 8 at 15:00 UTC per the channel cadence in `growth/X_GROWTH_PLAN.md`.
- Tweet 5 is a candidate for [IMAGE: `scripts/agent-runner.mjs` architecture diagram — markdown → runner → MCP servers + LLM → on-chain writes → run-log → git commit]. Visual tweets get ~150% more engagement.
- Tweet 10 CTA link should resolve to (a) the `docs/AGENTS_FRAMEWORK.md` page on the live docs site once published, with `agents/quality-matrix-manager.md` linked inline as the canonical example, OR (b) the GitHub permalink to `agents/quality-matrix-manager.md` if the docs route isn't live by Mon Jun 8. Either way, the link carries `utm_source=x&utm_campaign=plug-your-agent-w3`.
- Trinity foreshadow lives in Tweet 7 (Nox tease) and Tweet 10 (full trinity preview). Both are essential — Tweet 10 sets up the rest of the week's reads.
- Voice gut-check: zero emoji, zero hashtags, no "thread on…", no "so…". "Smart colleague at a conference."
- Quote-tweet the hook with one line ("Memory is git. Every decision auditable from `git log`.") at ~17:30 UTC for the second-wave bump described in `growth/templates/tweet-thread.md`.
