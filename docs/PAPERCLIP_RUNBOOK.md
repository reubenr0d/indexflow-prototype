# Paperclip Local Install Runbook

Step-by-step install + first-heartbeat + post-install housekeeping for the optional [Paperclip](https://paperclip.ing) operator dashboard. The repo is the **source of truth** — Paperclip is a layer on top that imports [`../COMPANY.md`](../COMPANY.md), schedules heartbeats via a shell adapter, and surfaces tickets / approvals / cost budgets from a web UI.

> **Scope reminder**: Paperclip manages the **engineering meta-agents** and (eventually) the **growth/ops agents**. Trading agents (`vault-manager`, `mining-manager`, `quality-matrix-manager` + the trading `risk-officer`) stay repo-managed via [`../scripts/agent-runner.mjs`](../scripts/agent-runner.mjs) + [`../.github/workflows/vault-agent.yml`](../.github/workflows/vault-agent.yml). The scope boundary is enforced by `COMPANY.md` §Out of Scope and the `scope_boundary` hard constraint.

This runbook is the *operator's* workflow — it's not a thing an agent runs. Per [`../AGENTS.md`](../AGENTS.md), agents must not deploy infrastructure or modify config without explicit user approval, so the operator (Reuben) does every step in this file.

---

## Mental model — what runs where

Paperclip has three layers of setup. **They're separate, sequential, and each leaves the layer above empty until you do the next step.** Confusing the layers is the #1 source of "why isn't my stuff there yet?" moments.

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 3: COMPANIES                                             │
│  (your IndexFlow org chart, employees, routines, budgets)       │
│  ↑                                                              │
│  │  imported by                                                 │
└──┼──────────────────────────────────────────────────────────────┘
   │
┌──┼──────────────────────────────────────────────────────────────┐
│  ↑  Layer 2: PLUGIN                                             │
│  │  (paperclip-agent-companies-plugin discovers COMPANY.md)     │
│  │                                                              │
│  ↑  installed into                                              │
└──┼──────────────────────────────────────────────────────────────┘
   │
┌──┼──────────────────────────────────────────────────────────────┐
│  ↑  Layer 1: INSTANCE                                           │
│     (Paperclip server + Postgres + workspace + LLM provider)    │
│     bootstrapped by `npx paperclipai onboard --yes`             │
│     then web-UI `/onboarding` for workspace+LLM choice          │
└─────────────────────────────────────────────────────────────────┘
```

**Two surprises to expect** (both are correct behaviour, not bugs):

1. After Phase 1, the dashboard shows an **empty workspace with no companies**. That's because nothing has been imported yet. Layer 1 is up; Layer 2 doesn't exist; Layer 3 has nothing to populate.
2. After Phase 2, the dashboard is **still empty** — the plugin is loaded but you haven't told it where to look. A new **Settings → Agent Companies** menu item appears; that's the only visible change. Layer 2 exists now but you haven't connected it to a source yet.

The IndexFlow org chart only materialises at Phase 4 (source add → Discover → Import).

---

## Pre-flight

Verify required versions are installed.

```bash
node --version   # >= 20
pnpm --version   # >= 9.15 — install with: npm install -g pnpm
git --version    # any recent version (only needed if doing the manual install path in Phase 1 Alternative)
```

If `node` is below 20:

```bash
# nvm path:
nvm install 20 && nvm use 20

# Or download the latest LTS from https://nodejs.org/
```

If `pnpm` is below 9.15:

```bash
npm install -g pnpm
pnpm --version
```

---

## Phase 1 — Install Paperclip (~5 min)

The recommended path is the interactive onboarding wizard, which manages an embedded PostgreSQL automatically.

### Step 1a — CLI onboarding (infrastructure)

```bash
npx paperclipai onboard --yes
```

This single command:

- Creates config at `~/.paperclip/instances/default/config.json`
- Creates embedded PostgreSQL at `~/.paperclip/instances/default/db`
- Creates local file storage at `~/.paperclip/instances/default/data/storage`
- Boots the server at **`http://localhost:3100`** (Paperclip binds `127.0.0.1` in `local_trusted` mode — no login, single-user on your machine)

Run `npx paperclipai doctor` anytime for diagnostics. (Bare `paperclipai` won't be on PATH after an `npx`-style install — see Phase 2 for the PATH gotcha.)

### Step 1b — Web-UI onboarding (workspace + LLM provider)

Open `http://localhost:3100` in a browser. **First visit redirects to `http://127.0.0.1:3100/onboarding`** — that's a separate, web-UI first-time wizard for things the CLI can't sensibly pick a default for:

- **Workspace name** — any name you like (e.g. `IndexFlow` or `reuben-local`)
- **Default LLM provider** — pick whichever you actually use (Anthropic / OpenAI / OpenRouter / local). Either paste your API key now or pick "configure later" and add via Settings → Secrets in [Phase 3](#phase-3--wire-the-secrets-the-shell-adapter-needs-5-min).
- Accept all other defaults.

> The CLI's `--yes` only accepts defaults for the **infrastructure** layer (DB type, storage, host, port). Workspace name + LLM provider are workspace-level business choices the web wizard handles. Both wizards are expected — they're not a duplicate.

### What you should see after Phase 1

✅ Dashboard loads with an **empty workspace** (no companies, no employees, no runs). That's correct — see the [Mental model](#mental-model--what-runs-where) above. Layer 1 is live; nothing has been imported yet. Phases 2 + 4 fix this.

### Phase 1 alternatives

| Path | When to use |
|---|---|
| **Docker** (`docker compose -f docker-compose.quickstart.yml up --build` from a cloned Paperclip repo) | You want full isolation and don't want Node on the host |
| **Manual** (`git clone https://github.com/paperclipai/paperclip.git && cd paperclip && pnpm install && pnpm dev`) | You plan to contribute to Paperclip itself |
| **External Postgres** (`DATABASE_URL=postgresql://...` env var to either method) | You're prepping for production deployment later — defer this for the local-test step |

### Phase 1 troubleshooting

| Symptom | Fix |
|---|---|
| `Port 3100 already in use` | `PORT=3200 npx paperclipai run` (or pick any free port) |
| `zsh: command not found: paperclipai` | The `npx paperclipai onboard --yes` install caches the binary inside `~/.npm/_npx/<hash>/node_modules/.bin/`, **not** on global PATH. Always prefix `npx`: `npx paperclipai <command>` |
| `pnpm: command not found` | `npm install -g pnpm` then re-verify |
| `Node version too old` | See pre-flight steps above |
| Server starts but UI shows DB errors | `rm -rf ~/.paperclip/instances/default/db && npx paperclipai run` (nukes data) |
| Browser sits on `/onboarding` forever | The web wizard requires an LLM provider choice even if `--yes` ran cleanly on the CLI side — pick one (or "configure later") and proceed |
| Dashboard is empty after onboarding completes | **Expected** — Phases 2 + 4 populate it. See the [Mental model](#mental-model--what-runs-where) and "What you should see after Phase 1" above. |
| Anything else | `npx paperclipai doctor --repair` |

---

## Phase 2 — Install the agent-companies plugin (~2 min)

The plugin discovers `COMPANY.md` (`schema: agentcompanies/v1`) and turns it into a Paperclip company.

**Use Paperclip's own plugin CLI via `npx` — NOT `pnpm add`.** `pnpm add` would install the package as a project dependency in your shell's `node_modules`, which is not how Paperclip discovers plugins. Use `npx` (rather than bare `paperclipai`) because the `npx paperclipai onboard --yes` install in Phase 1 caches the binary inside `~/.npm/_npx/<hash>/node_modules/.bin/` and does **not** put it on your global PATH — typing `paperclipai` directly in a fresh shell will fail with `zsh: command not found: paperclipai`.

```bash
npx paperclipai plugin install paperclip-agent-companies-plugin
```

Pin a specific version if you want determinism:

```bash
npx paperclipai plugin install paperclip-agent-companies-plugin --version 0.9.1
```

> Plugin hot-loads on install — **no server restart required.** The Paperclip server picks the new plugin up immediately and flips it to `status: "ready"`. Confirm with:
>
> ```bash
> curl -s http://127.0.0.1:3100/api/plugins | python3 -m json.tool
> ```
>
> Look for `"pluginKey": "paperclip-agent-companies-plugin"` with `"status": "ready"` and `"lastError": null`.

If the API isn't your style, confirm in the UI: **Settings → Plugins** should list `paperclip-agent-companies-plugin v0.9.x` as ready. The plugin's own README and changelog live at https://github.com/alvarosanchez/paperclip-agent-companies-plugin.

### What you should see after Phase 2

✅ **Settings → Plugins** lists the plugin as ready (`v0.9.x`).
✅ **Settings** sidebar has a new **Repository Catalog** entry (registered by the plugin's `agent-companies-settings` slot). Older docs may call this "Agent Companies" — same thing, the v0.9.x plugin display name changed.
✅ Dashboard / "Companies" view is **still empty.** That's correct — the plugin is installed but you haven't pointed it at a source yet. Phase 4 does that.

If the dashboard suddenly has stuff in it after a plugin install, something's wrong — Paperclip doesn't auto-discover repos on disk. Sources are added explicitly in Phase 4.

### Phase 2 — what the plugin schedules automatically

Once `status: "ready"`, the plugin registers an hourly cron job `catalog-auto-sync` (`0 * * * *`) that re-syncs every tracked source. That's why the runbook only tells you to "add the source once" in Phase 4 — drift gets auto-corrected within the hour. Disable per-source from the Repository Catalog page if you prefer manual sync during iteration.

---

## Phase 3 — Wire the secrets the shell adapter needs (~5 min)

Active employees in [`../COMPANY.md`](../COMPANY.md) declare an `envPassthrough` list per adapter. Paperclip needs to know the values for each listed env var, otherwise the shell adapter will fail when the runner tries to read them.

**Option A — Paperclip secrets store (recommended for local).** UI: **Settings → Secrets → Add secret**. Add each of:

| Secret name | Value | Used by | Notes |
|---|---|---|---|
| `LLM_API_KEY` | your provider API key | both meta-agents | OpenRouter / Anthropic / OpenAI / whichever you use |
| `LLM_BASE_URL` | e.g. `https://openrouter.ai/api/v1` | both meta-agents | Skip if you set per-agent overrides |
| `LLM_MODEL` | e.g. `anthropic/claude-sonnet-4.5` | both meta-agents | Default fallback model |
| `LLM_MODEL_SELF_IMPROVER_ISSUES` | per-agent override | `self-improver-issues` only | Optional |
| `LLM_MODEL_ISSUE_IMPLEMENTER` | per-agent override | `issue-implementer` only | Optional |
| `GH_TOKEN` | GitHub PAT with `repo` scope | both meta-agents | Needs issues + PR permissions on the IndexFlow repo |
| `AGENT_NETWORK` | `sepolia` | both | Meta-agents don't need a live RPC — `sepolia` for sanity |
| `AGENT_NON_INTERACTIVE_WRITE_EXECUTE` | `1` | both | Suppresses TTY prompts inside the shell adapter |
| `AGENT_MAX_TURNS` | `20` | both | Sensible cap for first-test runs |

**Option B — shell env (fastest for a one-off test).** Just `export` each var in the shell that runs `npx paperclipai run`. Less secure (visible to other processes via `/proc/<pid>/environ`); fine for the first smoke test, migrate to Paperclip secrets before any sustained use.

**Verify** by running `npx paperclipai env` — it should print every env var Paperclip resolves from your config + secrets store.

---

## Phase 4 — Import the IndexFlow company (~5 min)

In the Paperclip UI:

1. **Settings → Agent Companies → Add source.** Pick one URL:

   | URL form | When to use |
   |---|---|
   | **Local checkout (recommended for iteration)** — bare absolute path: `/Users/reuben/Desktop/minestarters/code/snx-prototype` | Reads your working tree directly (no `git clone`), so uncommitted `COMPANY.md` edits are visible immediately. Every save is one **Sync** click away from re-import. |
   | **GitHub URL** — `https://github.com/reubenr0d/indexflow-prototype` (or shorthand `reubenr0d/indexflow-prototype`) | More stable across machines; pin to a commit if you want deterministic imports; changes must be **committed and pushed** before the plugin sees them (the plugin does a shallow `git clone --depth 1` per scan). |

   > **DO NOT use a `file:///…` URL.** The plugin's `looksLikeLocalPath()` only matches `/`, `./`, `../`, `~/`, or `C:\`-style prefixes. A `file:///` prefix gets routed through the **git clone** path, which (a) fails for non-git directories, (b) silently reads the last committed `COMPANY.md` (missing any uncommitted edits) when it does work, and (c) typically fails Import with `"Company not found."` because the cloned repo state can't be matched back to the discovered company ID. Use the bare absolute path.

2. **Discover** — the plugin scans the source root for `COMPANY.md` files matching `schema: agentcompanies/v1`. It should find exactly one.

3. **Import as new company** — creates an `IndexFlow` company in Paperclip with:
   - **4 active employees**: `issue-implementer`, `self-improver-issues`, `risk-officer-self-improvement` (prompt-only), `risk-officer-self-improvement-issues` (prompt-only)
   - The brainstorm slate may surface as "draft" / "not runnable" items: `content-publisher`, `partnership-tracker`, `broadcast-bot`, `docs-syncer`, `basket-ideator`
   - The backlog slate may surface as "deferred": `vc-outreach-agent`, `lp-outreach-agent`, `galxe-quest-monitor`, `leaderboard-worker`, `growth-analytics`
   - **Trading agents should NOT appear**: `vault-manager`, `mining-manager`, `quality-matrix-manager`, trading `risk-officer`, and any `agents/skills/*.md` listed under `COMPANY.md` §Out of Scope `outOfScope.skills`. If they appear anyway, that's a plugin bug — the `outOfScope:` block in `COMPANY.md` is canonical.

4. **Enable daily auto-sync (overwrite mode is the plugin default).** Repo is canonical; any drift in the Paperclip company state gets overwritten on the next sync.

### Phase 4 troubleshooting

| Symptom | Fix |
|---|---|
| "No companies discovered at source" | Check the `COMPANY.md` frontmatter is intact at the source root and `schema: agentcompanies/v1` is set |
| **"Company not found." on clicking Import** | You almost certainly added the source with a `file:///…` URL — see the warning above the URL form table. Remove the source and re-add with a bare absolute path (`/Users/...`, no `file://` prefix). The plugin's `looksLikeLocalPath` (worker.js v0.9.1 line 17136) doesn't recognise `file://`, so the source got routed through the git-clone path and the company ID mismatch surfaces only at Import time. |
| **Discovered company is missing recent edits I just made to `COMPANY.md`** | Either (a) you added the source via GitHub URL (the plugin does a shallow `git clone --depth 1`; commit + push first), or (b) you used `file:///…` which also clones; switch to a bare absolute path to read the working tree directly. |
| Trading agents appear in the company | Confirm `outOfScope.agents[]` is present in `COMPANY.md` — open an issue against `paperclip-agent-companies-plugin` if it isn't being respected |
| Plugin import button greyed out | Confirm the plugin hot-loaded with `curl -s http://127.0.0.1:3100/api/plugins` — `status` should be `"ready"`. If `"pending"` or `"error"`, check `lastError` in that response; full server restart (`pkill -f 'paperclipai onboard' && npx paperclipai run`) is the nuclear option. |

---

## Phase 5 — First heartbeat (~5 min)

The cleanest "is this actually working?" smoke test is to manually trigger `self-improver-issues`.

> **Why this agent for the first test?**
> Lowest blast radius. `self-improver-issues` drafts proposals into `.agent-self-improvement/proposed-issues.json` *then* the issue risk-officer vets the manifest *before* `scripts/apply-self-improvement-issues.mjs --open-issues` calls `gh issue create`. Worst case if anything misfires: a draft JSON file lands on disk. No PRs, no on-chain calls, no public posts.
>
> Don't test `issue-implementer` first — it's callback-only (`schedule: null`, triggered by `/agent implement` on a GitHub issue). Test it later by labeling one of the issues `self-improver-issues` files and replying `/agent implement`.

### Steps

1. **Paperclip UI → Companies → IndexFlow → Employees → `self-improver-issues` → Run now.**

2. **Watch the run appear in the UI's heartbeat panel.** Stdout/stderr should stream live. Expect a run duration in the 1–5 minute range depending on the model.

3. **While the run is live**, in another terminal confirm the bridge file is materialising:

   ```bash
   ls -la /Users/reuben/Desktop/minestarters/code/snx-prototype/agents/memory/self-improver-issues/
   # Expect (timestamps will vary):
   #   paperclip-heartbeat.json   <- just-written
   #   state.json                  <- updated
   #   run-log.<network>.jsonl     <- appended
   ```

4. **After the run finishes**, check three places for round-trip evidence:

   - **Paperclip UI → Runs → latest** — should show a `heartbeat_runs` row with `status: succeeded` (or `succeeded_with_errors`), token usage, tool call count
   - **Paperclip UI → Costs** — should show a `cost_events` row for this run reflecting LLM spend
   - **Repo → `agents/memory/self-improver-issues/paperclip-heartbeat.json`** — open the file; it should contain the schema-`paperclip.heartbeat/v1` snapshot:

     ```jsonc
     {
       "schema": "paperclip.heartbeat/v1",
       "agentName": "self-improver-issues",
       "signalSource": null,           // self-improver-issues has no signal source
       "entryMode": "non-trading",
       "network": "sepolia",
       "vaultAddress": null,           // non-trading agent
       "vaultName": null,
       "runId": "...",
       "startedAt": "...",
       "finishedAt": "...",
       "status": "succeeded",
       "usage": {
         "turns": <int>,
         "toolCalls": <int>,
         "errors": <int>,
         "softFailures": <int>,
         "writeActions": <int>
       },
       "thesis": null,
       "summary": "...",               // one-paragraph summary of the run
       "writeActions": [...],          // every file the agent proposed to write
       "errors": [...]
     }
     ```

That last file is the round-trip proof: Paperclip ran the adapter → the runner wrote the bridge → it's now in git, ready for the next `commit-results` CI push to propagate.

### Phase 5 troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Run fails immediately with `ENOENT` | Adapter `cwd` doesn't resolve to the repo root | Edit the source-config to point `${REPO_ROOT}` at `/Users/reuben/Desktop/minestarters/code/snx-prototype` |
| Run fails with `LLM_API_KEY undefined` | Phase 3 secrets not loaded by the adapter | Restart Paperclip after adding secrets; or use Option B (shell env) for the first test |
| Run hangs without producing output | `AGENT_NON_INTERACTIVE_WRITE_EXECUTE` not set to `1` — runner is waiting for TTY input | Add the secret per Phase 3 and re-run |
| `paperclip-heartbeat.json` not written but run succeeded in UI | Dry-run mode is on, or `AGENT_VAULT_OVERRIDE` was set — both gate the write | Confirm neither `DRY_RUN=1` nor `AGENT_VAULT_OVERRIDE=...` is in the adapter env |
| `gh: command not found` partway through | Runner tried to call `gh` for issue context | `brew install gh && gh auth login` (one-time, on the operator's machine) |

---

## Phase 6 — Decide on Paperclip-vs-CI cron parity (~5 min)

The `self-improver-issues` routine in `COMPANY.md` is `state: paused` because the existing hourly cron in `.github/workflows/vault-agent.yml` is canonical today. Two acceptable end states — pick one, don't run both:

### Option A: Keep Paperclip as a dashboard (default, lowest risk)

Paperclip surfaces the runs that CI drives. You use the UI for visibility + the occasional manual re-run. Leave the routine `paused`.

**Pros**: Zero risk of duplicate runs racing on the same proposal manifest. CI cron is battle-tested. Paperclip is purely additive.

**Cons**: You don't get Paperclip's scheduler benefits (budget-driven pause-on-overrun, per-employee cost caps as hard stops).

### Option B: Cut over to Paperclip cron

Flip `state: paused` → `state: enabled` in `COMPANY.md`'s `routines[]` entry for `self-improver-issues`, **and** disable the corresponding step in `.github/workflows/vault-agent.yml`. Two changes that must land together.

**Pros**: Single scheduler. Paperclip enforces the per-employee monthly budget cap as a hard stop (CI doesn't).

**Cons**: Failure modes shift from "GitHub Actions cron skipped/queued" to "your local machine was asleep when the heartbeat was due". For production use, that's a reason to run Paperclip on a small VM rather than locally.

**Don't run both** — they'll race on `.agent-self-improvement/proposed-issues.json` and produce duplicate GitHub issues.

---

## After Successful Install — re-key AGENT_DEPLOYMENT_MEMORY.md

Per [`../AGENTS.md`](../AGENTS.md) §Agent Deployment Memory, every cloud / on-chain / local resource lives in [`../AGENT_DEPLOYMENT_MEMORY.md`](../AGENT_DEPLOYMENT_MEMORY.md) as an allowlist row. The Paperclip row is currently `planned`; once Phase 5 succeeds, replace it with the `live` version below.

The Paperclip row in [`../AGENT_DEPLOYMENT_MEMORY.md`](../AGENT_DEPLOYMENT_MEMORY.md) is preceded by an HTML comment that flags this as a deferred edit. Find the comment + the row immediately after; replace **only the row**, leave the HTML comment in place until after the first commit lands (it's a marker for anyone reading the file in the meantime).

### The pre-staged diff

Replace the existing `| Paperclip (planned) | ... | 2026-05-26 (planned) |` row with this **single-row replacement**. Fill in the two placeholders marked `<FILL>` before saving:

```markdown
| Paperclip (live) | `~/.paperclip/instances/default/` (config + embedded Postgres + local storage; entirely separate from this repo's working tree) | Self-hosted control plane (Node.js + embedded Postgres + React UI at `http://localhost:<FILL_ACTUAL_PORT_DEFAULT_3100>` in `local_trusted` mode) | Installed via `npx paperclipai onboard --yes` + `npx paperclipai plugin install paperclip-agent-companies-plugin v<FILL_PLUGIN_VERSION_E_G_0.9.1>` (plugin hot-loads, no server restart needed). Runbook: [`docs/PAPERCLIP_RUNBOOK.md`](docs/PAPERCLIP_RUNBOOK.md). | local | user | `read`, `update-config` | **LIVE** — first heartbeat for `self-improver-issues` ran on `<FILL_ISO_DATE>` and wrote `agents/memory/self-improver-issues/paperclip-heartbeat.json` round-trip-confirmed. Operator dashboard for the **IndexFlow** engineering meta-agents and growth/ops agents (NOT the trading agents — `vault-manager`, `mining-manager`, `quality-matrix-manager` and the trading `risk-officer` remain repo-managed via `scripts/agent-runner.mjs` + `.github/workflows/vault-agent.yml` per the scope decision in [`COMPANY.md`](COMPANY.md) §Out of Scope). Imports `COMPANY.md` (schema `agentcompanies/v1`, `name: IndexFlow`, `scope: meta_and_growth_agents`) from this repo and runs each ACTIVE `agents/*.md` employee on a heartbeat via a shell adapter that shells out to `npm run agent:run -- <agent>`. Active employees today: `issue-implementer` (callback-only), `self-improver-issues` (routine `<FILL_paused_OR_enabled_PER_PHASE_6_DECISION>`), and two `kind: prompt-only` reviewers (`risk-officer-self-improvement`, `risk-officer-self-improvement-issues`) that don't heartbeat. Daily auto-sync (overwrite mode) keeps the Paperclip company state aligned with this repo — **repo is canonical**. Paperclip's Postgres holds runtime history (`heartbeat_runs`, `cost_events`, `activity_log`, tickets, approvals); a lightweight `agents/memory/<agent>/paperclip-heartbeat.json` bridge file is written by `scripts/agent-runner.mjs` on each run and committed back by the `commit-results` job in `.github/workflows/vault-agent.yml`. Brainstormed (not yet active) employees: `content-publisher`, `partnership-tracker`, `broadcast-bot`, `docs-syncer`, `basket-ideator` — each requires a new `agents/<id>.md` prompt file + (in some cases) new skills/MCPs before Paperclip can schedule them. `basket-ideator` is suggest-only and never deploys vault contracts (the repo-managed trading-agent flow owns deployment), preserving the scope boundary. The brainstormed `broadcast-bot` is the same Paperclip-side identity as the planned `@IndexFlowBots` X bot row in this file. Owner: **user** (Reuben installs + manages). Agent role limited to `read` (the agent never invokes the Paperclip CLI or DB directly; the dashboard is for human operators). | `<FILL_ISO_DATE>` (live) |
```

### Placeholders to fill

| Placeholder | Value to fill |
|---|---|
| `<FILL_ACTUAL_PORT_DEFAULT_3100>` | Whatever port Paperclip is actually listening on (default `3100`; change if you set `PORT=...`) |
| `<FILL_PLUGIN_VERSION_E_G_0.4.1>` | The version of `paperclip-agent-companies-plugin` that Settings → Plugins shows (e.g. `0.4.1`) |
| `<FILL_ISO_DATE>` | Today's date in `YYYY-MM-DD`, used twice (in the description body + the final `last_updated` column) |
| `<FILL_paused_OR_enabled_PER_PHASE_6_DECISION>` | `paused` if you chose Option A in Phase 6, `enabled` if you chose Option B |

### After applying the re-key

1. Save `AGENT_DEPLOYMENT_MEMORY.md`.
2. Update the file's top-of-file `Last updated: 2026-05-26 (...)` line to reflect the install date.
3. Remove the HTML comment marker block above the row (its job is done).
4. Surface the diff to yourself in `git status`; per [`../AGENTS.md`](../AGENTS.md), agents must not auto-commit — you commit it.

---

## Optional Phase 7 — Beyond local

Once local works and you've used Paperclip for a week or two, the path to cloud is well-trodden:

| Concern | Local | Production |
|---|---|---|
| **Database** | Embedded PG (auto-created at `~/.paperclip/instances/default/db`) | `DATABASE_URL=postgresql://user:pass@host:5432/paperclip` (PG 17+) |
| **Storage** | Local disk (auto-created at `~/.paperclip/instances/default/data/storage`) | `STORAGE_PROVIDER=s3` + `S3_BUCKET`/`S3_REGION`/`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` |
| **Auth mode** | `local_trusted` (no login) | `DEPLOYMENT_MODE=authenticated` + `BASE_URL=https://paperclip.example.com` |
| **Process model** | `npx paperclipai run` (or `npx paperclipai onboard --yes` for first boot) from terminal | Docker (`docker-compose.quickstart.yml`) or any Node-friendly platform; once globally installed (`npm install -g paperclipai`) the `npx` prefix can be dropped |
| **Tunnelling for solo-operator access on the go** | Not needed | Tailscale (run `npx paperclipai run --bind tailnet` and connect via Tailscale-assigned IP) |

**Before deploying anywhere cloud-side**, per [`../AGENTS.md`](../AGENTS.md) §Deployment Safety Rules:

1. Add the new resource to [`../AGENT_DEPLOYMENT_MEMORY.md`](../AGENT_DEPLOYMENT_MEMORY.md) **before** creating it (planned row, just like the current local Paperclip row was).
2. Surface the deploy plan to yourself explicitly — no agent should auto-create cloud resources without your in-session approval.
3. Update this runbook with the production-specific steps (DATABASE_URL setup, S3 bucket creation, DNS, TLS, Tailscale bootstrap, etc.) once you've done it once.

The local-trusted-only mode is intentionally the default for v1. Skipping straight to cloud is a meaningful additional risk surface (auth, network, secrets management) that the dashboard's value-add doesn't yet justify.

---

## Cross-references

- [`../COMPANY.md`](../COMPANY.md) — the manifest the plugin imports (`schema: agentcompanies/v1`, `name: IndexFlow`, `scope: meta_and_growth_agents`)
- [`../AGENT_DEPLOYMENT_MEMORY.md`](../AGENT_DEPLOYMENT_MEMORY.md) — the resource allowlist Phase 5 re-keys
- [`AGENTS_FRAMEWORK.md`](AGENTS_FRAMEWORK.md) §Paperclip Integration — architecture diagram + sync contract + "what doesn't change"
- [`../AGENTS.md`](../AGENTS.md) — repo-wide policy (never-auto-commit; deployment-memory; deployment safety)
- Paperclip docs: https://paperclipai-paperclip.mintlify.app/installation
- Paperclip repo: https://github.com/paperclipai/paperclip
- Plugin repo: https://github.com/alvarosanchez/paperclip-agent-companies-plugin
- Plugin on npm: `paperclip-agent-companies-plugin` (current latest `0.4.1`, 2026-04-20)
