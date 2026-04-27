---
title: "Your Vault Manager Is a Markdown File"
description: "IndexFlow agents are defined as markdown -- system prompt, strategy rules, risk limits -- and they deploy and manage basket vaults autonomously on testnet using real asset prices. Now with 0G Network integration for decentralized AI inference and storage, plus KeeperHub for reliable transaction execution."
date: "2026-04-16"
author: "Reuben Rodrigues"
tags: ["AI-agents", "vaults", "testnet", "autonomous", "0G", "KeeperHub"]
published: true
image: "/blog/autonomous-ai-agents-managing-vaults.svg"
---

The asset management loop is not complicated to describe. Research markets. Allocate capital. Monitor positions. Rebalance when conditions change. Exit when risk thresholds are breached. Repeat on a schedule.

What is complicated is doing it 24/7 on-chain, across multiple assets, with real money, while respecting leverage limits, reserve requirements, and stop-loss rules. Humans are good at strategy. They are less good at running a disciplined loop every six hours without skipping a beat.

So we built a framework where the vault manager is an LLM. The entire agent -- identity, strategy, risk rules, and execution task -- is defined in a single markdown file. No JavaScript. No custom orchestration code. The runner handles vault deployment, tool access, memory, and the execution loop automatically.

## What an Agent Looks Like

An agent is a markdown file at `agents/<name>.md`. The YAML frontmatter defines configuration: which MCP tool servers to connect, which on-chain write operations are permitted, vault parameters like fees and leverage limits, and entry criteria for new positions. The body is a system prompt -- the agent's identity and strategy rules. A `## User Prompt` section at the end defines the task that kicks off each run.

Here is a simplified version of the sample vault manager:

```markdown
---
name: sample-vault-manager
skills:
  - vault-manager
  - yfinance
mcpServers:
  - vault-manager-mcp
  - yfinance-mcp
writeTools:
  - create_vault
  - set_vault_assets
  - open_position
  - close_position
vaultName: Mining Basket
depositFeeBps: 50
redeemFeeBps: 50
maxTurns: 20
temperature: 0.2
---

You are a vault management agent for a DeFi protocol
that runs basket vaults with perp hedging.

## Rules

- Never allocate more than 50% of idle USDC to perp
- Close positions that have lost more than 15% of collateral
- Take profits when unrealised PnL exceeds 20%

## User Prompt

Check your vault, research market conditions, and manage
positions. Provide a full summary when done.
```

That is the entire agent. Strategy lives in the prompt. Tool access is declared in frontmatter. The runner does the rest.

## How the Agent Operates

Each run follows a five-step loop:

1. **Check vault state.** The agent calls `get_vault_state` to read its current positions, allocations, reserves, and oracle prices.
2. **Research markets.** It uses `yfinance_search` and `yfinance_quote` to pull live prices, day changes, and volume for tracked assets. These are real Yahoo Finance quotes -- AAPL, BHP.AX, GC=F, whatever the strategy calls for.
3. **Compare and decide.** The agent compares on-chain oracle prices against live market prices, evaluates position P&L against its rules, and decides what to do.
4. **Execute.** It calls on-chain write tools -- `open_position`, `close_position`, `allocate_to_perp`, `withdraw_from_perp` -- to act on its decisions.
5. **Summarize.** It outputs a structured summary: vault state, market observations, actions taken, and recommendations for the next run.

The agent connects to two **MCP servers** (Model Context Protocol). The vault-manager server exposes on-chain read and write operations: deploying vaults, wiring assets, managing positions, reading state. The yfinance server provides market data lookups. The agent treats these as tools it can call -- the same way a human operator would use a dashboard, except the agent reasons about when and why to call each tool.

On the first run, the agent has no vault. The runner instructs it to call `create_vault`, which deploys a new basket vault on-chain. The deploying wallet becomes the vault owner. On subsequent runs, the runner loads the saved vault address from persistent memory and injects it into the system prompt. Memory is stored at `agents/memory/<agent-name>/` and committed to the repo, so agent state is durable, inspectable, and version-controlled.

## Real Prices, Even on Testnet

Most testnet deployments use mocked price feeds. Fixed values. Random walks. Data that bears no relationship to real markets. This makes testnet useless for validating strategy logic -- a strategy that performs well against fake data tells you nothing about how it will perform against real volatility.

IndexFlow's testnet uses **real asset prices**. A separate price keeper pulls live quotes from Yahoo Finance and pushes them on-chain as oracle updates. When the agent checks the price of BHP.AX on Sepolia, it sees the same price you would see on the ASX. When it evaluates gold via GC=F, it gets the actual COMEX quote.

This means strategy logic developed and tested on testnet transfers directly to production. The prices are real. The stop-loss thresholds are tested against real drawdowns. The entry signals are validated against real momentum and volume. The only thing that changes between testnet and mainnet is whether the capital is real.

## Human Managers Use the Same Contracts

The vault contracts have no concept of an "agent." There is no agent role, no agent registry, no special permissions. The vault owner is an ordinary Ethereum account with `onlyOwner` rights. Whether that account is controlled by a human using the web interface or by an LLM sending transactions through an MCP server, the contract does not know or care.

A human asset manager can do everything an agent does: create a vault, wire assets, set allocations, open and close perp positions, manage reserves. The web app at [indexflow.app](https://indexflow.app) exposes these operations through a standard UI. The [operator documentation](/docs/asset-manager-flow) walks through the full curator flow -- from vault creation to position management to fee collection.

AI agents are an **automation layer**, not a replacement for human judgment. A manager who wants to run a gold-focused vault can do it manually through the UI. Or they can write a markdown file that encodes their strategy and let it run on a schedule. Or they can start manual and gradually encode proven rules into an agent. The infrastructure supports all three modes because the underlying contract surface is the same.

## Safety Rails

Autonomous does not mean uncontrolled. The framework is designed for autonomy with guardrails.

**Dry-run mode.** Set `AGENT_DRY_RUN=1` and the agent runs its full loop -- reads state, researches markets, reasons about positions -- but all write operations are skipped. You see exactly what the agent would do without any on-chain effect.

**Write confirmation.** Enabled by default. When the agent proposes write operations, the runner pauses and shows the proposed batch. The operator can approve, reject, or provide feedback that sends the agent back to revise its plan. In non-interactive environments like CI, writes are skipped unless explicitly allowed.

**Risk guardrails.** The sample agent enforces hard limits in its system prompt: maximum 50% of idle USDC allocated to perp, minimum 10% collateral ratio (max ~10x leverage), stop-loss at 15% collateral drawdown, take-profit at 20% collateral gain. These are prompt-level rules that the agent follows on every run.

**Single-vault isolation.** Each agent manages exactly one vault. It cannot read or write other vaults. The runner enforces this by injecting only the agent's own vault address into the prompt context.

**Persistent memory.** Run history is stored as append-only JSONL logs per network. The operator can inspect every past run -- what the agent observed, what it decided, what it executed, and what it recommended for next time.

## Coming Next: Always-On Agents on Theseus

Today, agents run locally via `npm run agent:run` or on a schedule via GitHub Actions cron (every 6 hours by default). This works, but it means the agent only acts at discrete intervals. Markets move between runs.

We are building toward deploying vault agents on **Theseus** as an always-on runtime. Instead of cron-triggered runs, agents will operate as persistent processes that can react to market conditions in real time. The agent skill convention already follows the [Proof of Lobster](https://github.com/Theseuschain/proof-of-lobster/tree/master/agent) pattern that Theseus uses for reusable tool references, so the migration path is natural: same agent definition, same skills, same MCP servers, persistent execution.

This is not live yet. When it is, the same markdown file that defines your agent today will run continuously on Theseus without changes to the strategy, rules, or tool surface.

## Decentralized Infrastructure: 0G Network + KeeperHub

The agent framework now integrates with decentralized infrastructure for production-grade autonomous operation.

**0G Compute** provides decentralized LLM inference. Instead of routing requests to OpenAI, agents can use 0G's Compute Network for TEE-verified AI responses. The inference happens on decentralized nodes, and responses include cryptographic attestation that the model ran unmodified. This matters for agents managing real capital -- you want verifiable reasoning, not a black box.

**0G Storage** provides persistent agent memory. The standard agent stores state in local files (`agents/memory/<name>/state.json`). The 0G-enabled agent stores state in 0G's decentralized KV store and appends run history to the Log layer. Every state update and run summary is Merkle-verified and retrievable by hash. Agent memory becomes auditable and tamper-evident.

**KeeperHub** provides reliable transaction execution. Direct on-chain writes can fail for many reasons: gas spikes, network congestion, nonce conflicts, MEV extraction. KeeperHub wraps transactions with automatic retries, smart gas estimation, and private routing. Every transaction gets an audit trail. When an agent opens a position or closes a loser, the write goes through KeeperHub's execution layer instead of a raw `sendTransaction`.

The `0g-vault-manager` agent definition shows how these integrate:

```markdown
---
name: 0g-vault-manager
skills:
  - vault-manager
  - yfinance
  - 0g-storage
  - keeperhub
mcpServers:
  - vault-manager-mcp
  - yfinance-mcp
  - 0g-storage-mcp
  - keeperhub-mcp
---
```

Same markdown format. Same strategy rules. Different infrastructure stack.

## Try It

The protocol is live on Sepolia testnet with real asset prices.

**Standard agent (OpenAI + file-based memory):**
- **Run the sample agent:** `LLM_API_KEY=sk-... PRIVATE_KEY=0x... npm run agent:run -- sample-vault-manager`
- **Dry-run first:** `AGENT_DRY_RUN=1 LLM_API_KEY=sk-... npm run agent:run -- sample-vault-manager`

**0G-enabled agent (decentralized stack):**
- **With 0G Compute:** `ZG_COMPUTE_PROVIDER=0x... ZG_PRIVATE_KEY=0x... KEEPERHUB_API_KEY=kh_... npm run agent:0g`
- **With OpenAI fallback:** `LLM_API_KEY=sk-... ZG_PRIVATE_KEY=0x... KEEPERHUB_API_KEY=kh_... npm run agent:0g`
- **Dry-run:** `npm run agent:0g:dry`

**Manual operation:**
- [Launch the testnet app](https://indexflow.app/baskets)
- [Multi-Agent Framework docs](/docs/agents-framework) -- agent creation, skills, memory, MCP servers, full tool reference

Create a markdown file. Define your strategy. Let it run -- on OpenAI or 0G Compute, with file memory or decentralized storage, with direct writes or KeeperHub execution. The contracts do not care who is on the other end or how the infrastructure is wired.
