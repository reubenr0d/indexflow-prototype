#!/usr/bin/env node
/**
 * Configure the process adapter for every active runnable employee imported
 * into Paperclip, so the heartbeat actually shells out to `npm run agent:run`.
 *
 * Why this exists
 * ---------------
 * `paperclip-agent-companies-plugin` v0.9.x imports agents from the mirror
 * (`paperclip/companies/indexflow/agents/<slug>/AGENTS.md`) but does NOT
 * apply the `employees[].adapter` block declared in COMPANY.md — that block
 * is part of the canonical manifest, not the per-agent AGENTS.md the plugin
 * reads. Without the adapter wiring, Paperclip stores
 * `adapterType: "process"` with an `adapterConfig` containing only the
 * instructions-bundle paths, no `command`/`args`/`cwd`. The first heartbeat
 * then fails with:
 *
 *   Process adapter missing command
 *
 * This script PATCHes each active runnable agent through Paperclip's
 * `/api/agents/:id` endpoint to add the missing pieces:
 *
 *   - command: "npm"
 *   - args:    ["run", "agent:run", "--", <slug>]
 *   - cwd:     repo root (auto-detected from this script's location)
 *   - env:     secret_ref bindings for every envPassthrough key declared
 *              in COMPANY.md for that employee
 *
 * The PATCH route merges `adapterConfig` by default (no `replaceAdapterConfig`),
 * so the instructions-bundle keys the import set are preserved.
 *
 * Idempotent: if the agent's adapterConfig already has matching command + args
 * + cwd + env bindings, the script logs "no change" and skips the PATCH.
 *
 * Required secrets
 * ----------------
 * The script binds `env` to existing secrets by name (case-sensitive). Create
 * them first via Paperclip UI → Settings → Secrets (or the secrets API). Per
 * docs/PAPERCLIP_RUNBOOK.md §Phase 3:
 *
 *   - LLM_API_KEY                                (required, both agents)
 *   - LLM_BASE_URL                               (required, both agents)
 *   - LLM_MODEL                                  (required, both agents)
 *   - LLM_MODEL_SELF_IMPROVER_ISSUES             (optional, self-improver only)
 *   - LLM_MODEL_ISSUE_IMPLEMENTER                (optional, implementer only)
 *   - GH_TOKEN                                   (required, both agents)
 *   - AGENT_NETWORK                              (required, both agents)
 *   - AGENT_NON_INTERACTIVE_WRITE_EXECUTE        (required, both agents)
 *   - AGENT_MAX_TURNS                            (required, both agents)
 *
 * Missing optional secrets are skipped with a note. Missing required secrets
 * are reported but the PATCH still proceeds (the heartbeat will surface the
 * underlying "LLM_API_KEY undefined" failure if you actually need them).
 *
 * Environment
 * -----------
 * - PAPERCLIP_API_BASE          (default http://127.0.0.1:3100/api)
 * - PAPERCLIP_TARGET_COMPANY_ID (default the company named "Indexflow")
 * - PAPERCLIP_REPO_ROOT         (default auto-detected from this script)
 *
 * Usage
 * -----
 *   npm run paperclip:configure-adapters
 *
 * Recommended post-import workflow:
 *   npm run paperclip:import && npm run paperclip:configure-adapters
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = resolve(SCRIPT_DIR, "..");

const API_BASE = process.env.PAPERCLIP_API_BASE || "http://127.0.0.1:3100/api";
const REPO_ROOT = process.env.PAPERCLIP_REPO_ROOT || DEFAULT_REPO_ROOT;

// Mirror of scripts/sync-paperclip-mirror.mjs ACTIVE_RUNNABLE_EMPLOYEES.
// Adapter wiring per employee — env keys mirror the envPassthrough block in
// COMPANY.md for each employee.
const ACTIVE_EMPLOYEES = [
  {
    slug: "self-improver-issues",
    requiredEnv: [
      "LLM_API_KEY",
      "LLM_BASE_URL",
      "LLM_MODEL",
      "GH_TOKEN",
      "AGENT_NETWORK",
      "AGENT_NON_INTERACTIVE_WRITE_EXECUTE",
      "AGENT_MAX_TURNS",
    ],
    optionalEnv: ["LLM_MODEL_SELF_IMPROVER_ISSUES"],
  },
  {
    slug: "issue-implementer",
    requiredEnv: [
      "LLM_API_KEY",
      "LLM_BASE_URL",
      "LLM_MODEL",
      "GH_TOKEN",
      "AGENT_NETWORK",
      "AGENT_NON_INTERACTIVE_WRITE_EXECUTE",
      "AGENT_MAX_TURNS",
    ],
    optionalEnv: ["LLM_MODEL_ISSUE_IMPLEMENTER"],
  },
  {
    // partnership-tracker shares the engineering secret bag because it
    // reuses repo-editor-mcp + the shared proposed-issues manifest.
    slug: "partnership-tracker",
    requiredEnv: [
      "LLM_API_KEY",
      "LLM_BASE_URL",
      "LLM_MODEL",
      "GH_TOKEN",
      "AGENT_NETWORK",
      "AGENT_NON_INTERACTIVE_WRITE_EXECUTE",
      "AGENT_MAX_TURNS",
    ],
    optionalEnv: [],
  },
  {
    // basket-ideator: same engineering secret bag, plus optional
    // ENVIO_URL as a fallback for the envio-graphql-mcp URL resolver
    // (canonical source is AGENT_DEPLOYMENT_MEMORY.md).
    slug: "basket-ideator",
    requiredEnv: [
      "LLM_API_KEY",
      "LLM_BASE_URL",
      "LLM_MODEL",
      "GH_TOKEN",
      "AGENT_NETWORK",
      "AGENT_NON_INTERACTIVE_WRITE_EXECUTE",
      "AGENT_MAX_TURNS",
    ],
    optionalEnv: ["ENVIO_URL"],
  },
  {
    // content-publisher: local-only adapter, no CI. Founder triggers via
    // Paperclip "Run now" per slot. Same engineering secret bag for the
    // LLM + GH read access (no Twitter creds in v1 — public-channel
    // posting stays human-only).
    slug: "content-publisher",
    requiredEnv: [
      "LLM_API_KEY",
      "LLM_BASE_URL",
      "LLM_MODEL",
      "GH_TOKEN",
      "AGENT_NETWORK",
      "AGENT_NON_INTERACTIVE_WRITE_EXECUTE",
      "AGENT_MAX_TURNS",
    ],
    optionalEnv: [],
  },
];

async function call(path, init = {}) {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(
      `${init.method || "GET"} ${path} failed (${response.status}): ${
        typeof body === "string" ? body : JSON.stringify(body)
      }`
    );
  }
  return body;
}

function step(label) {
  process.stdout.write(`\n=== ${label}\n`);
}

function envBindingsEqual(left, right) {
  if (!left || !right) return left === right;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  if (leftKeys.some((k, i) => k !== rightKeys[i])) return false;
  return leftKeys.every((k) => {
    const a = left[k];
    const b = right[k];
    if (typeof a === "string" || typeof b === "string") return a === b;
    return a?.type === b?.type && a?.secretId === b?.secretId;
  });
}

function arrayShallowEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return left === right;
  if (left.length !== right.length) return false;
  return left.every((v, i) => v === right[i]);
}

async function main() {
  console.log(`  repoRoot: ${REPO_ROOT}`);

  step("Resolve target Paperclip company");
  const companies = await call("/companies");
  let target;
  if (process.env.PAPERCLIP_TARGET_COMPANY_ID) {
    target = companies.find((c) => c.id === process.env.PAPERCLIP_TARGET_COMPANY_ID);
    if (!target) {
      throw new Error(
        `PAPERCLIP_TARGET_COMPANY_ID=${process.env.PAPERCLIP_TARGET_COMPANY_ID} not found in Paperclip company list.`
      );
    }
  } else {
    target =
      companies.find((c) => c.name.toLowerCase() === "indexflow") || companies[0];
  }
  if (!target) {
    throw new Error(
      "No Paperclip company found. Run `npm run paperclip:import` first."
    );
  }
  console.log(`  targetCompanyId: ${target.id} (name=${target.name})`);

  step("Load company secrets (for env -> secret_ref resolution)");
  const secrets = await call(`/companies/${target.id}/secrets`);
  const secretsByName = new Map();
  for (const secret of secrets) {
    if (secret.status === "active") {
      secretsByName.set(secret.name, secret);
    }
  }
  console.log(`  found ${secretsByName.size} active secrets: ${[...secretsByName.keys()].sort().join(", ")}`);

  step("Load agents in target company");
  const agentsList = await call(`/companies/${target.id}/agents`);
  console.log(`  ${agentsList.length} agents present`);

  step("Reconcile each active runnable employee");
  let patched = 0;
  let unchanged = 0;
  for (const employee of ACTIVE_EMPLOYEES) {
    const agent = agentsList.find(
      (a) => a.urlKey === employee.slug || a.name === employee.slug
    );
    if (!agent) {
      console.log(
        `  - ${employee.slug}: NOT FOUND in Paperclip (skip). Run \`npm run paperclip:import\` first.`
      );
      continue;
    }

    const fullAgent = await call(`/agents/${agent.id}?companyId=${target.id}`);
    const existingConfig =
      fullAgent.adapterConfig && typeof fullAgent.adapterConfig === "object"
        ? fullAgent.adapterConfig
        : {};

    const desiredArgs = ["run", "agent:run", "--", employee.slug];
    const desiredCommand = "npm";
    const desiredCwd = REPO_ROOT;

    const desiredEnv = {};
    const missingRequired = [];
    const missingOptional = [];
    for (const key of employee.requiredEnv) {
      const secret = secretsByName.get(key);
      if (secret) {
        desiredEnv[key] = {
          type: "secret_ref",
          secretId: secret.id,
          version: "latest",
        };
      } else {
        missingRequired.push(key);
      }
    }
    for (const key of employee.optionalEnv) {
      const secret = secretsByName.get(key);
      if (secret) {
        desiredEnv[key] = {
          type: "secret_ref",
          secretId: secret.id,
          version: "latest",
        };
      } else {
        missingOptional.push(key);
      }
    }

    const existingEnv =
      existingConfig.env && typeof existingConfig.env === "object"
        ? existingConfig.env
        : null;

    const needsPatch =
      existingConfig.command !== desiredCommand ||
      !arrayShallowEqual(existingConfig.args, desiredArgs) ||
      existingConfig.cwd !== desiredCwd ||
      !envBindingsEqual(existingEnv, desiredEnv);

    if (!needsPatch) {
      console.log(`  - ${employee.slug}: already configured (no change)`);
      unchanged += 1;
      if (missingRequired.length) {
        console.log(`      WARN: missing required secrets: ${missingRequired.join(", ")}`);
      }
      continue;
    }

    const patchBody = {
      adapterConfig: {
        command: desiredCommand,
        args: desiredArgs,
        cwd: desiredCwd,
        env: desiredEnv,
      },
    };

    await call(`/agents/${agent.id}`, {
      method: "PATCH",
      body: JSON.stringify(patchBody),
    });

    patched += 1;
    console.log(
      `  - ${employee.slug}: PATCHED (cmd=${desiredCommand} ${desiredArgs.join(" ")}, cwd=${desiredCwd}, env=${Object.keys(desiredEnv).length} secret_refs)`
    );
    if (missingRequired.length) {
      console.log(`      WARN: missing required secrets: ${missingRequired.join(", ")} — heartbeat will fail until added in Settings → Secrets`);
    }
    if (missingOptional.length) {
      console.log(`      note: optional secrets not present (fine): ${missingOptional.join(", ")}`);
    }
  }

  step("Done");
  console.log(`  patched: ${patched}, unchanged: ${unchanged}`);
  console.log(
    `Run a heartbeat via Paperclip UI (Companies → ${target.name} → Agents → <agent> → Run now),`
  );
  console.log(
    `then check agents/memory/<agent>/paperclip-heartbeat.json for the round-trip bridge file.`
  );
}

main().catch((error) => {
  console.error(`\nFailed: ${error.message}`);
  process.exitCode = 1;
});
