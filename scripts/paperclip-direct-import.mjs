#!/usr/bin/env node
/**
 * Drive the Paperclip agent-companies import end-to-end via HTTP, working
 * around the v0.9.1 UI ↔ plugin contract bug.
 *
 * The bug
 * -------
 * When the UI's "Import" button is clicked, the request body it sends is:
 *
 *   { companyId: "<paperclip-target-uuid>",
 *     params: { companyId: "<source-id>", selection: {...} } }
 *
 * The Paperclip server forwards this raw body to the plugin worker without
 * unwrapping `params`. The worker's `catalog.prepare-company-import` action
 * reads `rawParams.companyId` — which is the OUTER Paperclip-UUID, not the
 * INNER source-id. `findRepositoryCompany` doesn't find that UUID in the
 * catalog state (the plugin only knows source-ids, not Paperclip UUIDs),
 * and throws `"Company not found."` before even looking at the selection.
 *
 * Independently verified by curling the same endpoint with both shapes:
 *   - flat body `{companyId: "repo-...", selection: {...}}` → 200 OK
 *   - UI-wrapped body                                       → 502 "Company not found."
 *
 * What this script does
 * ---------------------
 * 1. Read the plugin's catalog state to discover the source companyId.
 * 2. Read Paperclip's main companies list to discover the target company UUID
 *    (defaults to the onboarding-created `Indexflow` company).
 * 3. Call `catalog.prepare-company-import` with a flat body to get the
 *    prepared import source (a bundle of file paths → contents).
 * 4. POST the prepared source to Paperclip's `/api/companies/import` with
 *    `target.mode = "existing_company"` — this is the same endpoint the
 *    plugin UI calls, just bypassing the broken prepare-step wrapping.
 * 5. Call `catalog.record-company-import` to register the link in the
 *    plugin's catalog so future auto-syncs (hourly + daily) work.
 * 6. Verify by listing the agents in the target company.
 *
 * Environment
 * -----------
 * - PAPERCLIP_API_BASE (default http://127.0.0.1:3100/api)
 * - PAPERCLIP_PLUGIN_ID (default discovered from /plugins)
 * - PAPERCLIP_TARGET_COMPANY_ID (default the company named "Indexflow")
 *
 * Idempotent: re-running after a successful import is a no-op for the
 * record-company-import step (it upserts) and a "replace" sync for the
 * /api/companies/import step (agents get re-created with the same content).
 */

const API_BASE = process.env.PAPERCLIP_API_BASE || "http://127.0.0.1:3100/api";

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

async function main() {
  step("Resolve plugin id");
  const pluginsList = await call("/plugins");
  const plugins = Array.isArray(pluginsList) ? pluginsList : pluginsList?.data ?? [];
  const agentCompaniesPlugin = plugins.find(
    (p) => p.pluginKey === "paperclip-agent-companies-plugin"
  );
  if (!agentCompaniesPlugin) {
    throw new Error(
      "paperclip-agent-companies-plugin not found. Install with: npx paperclipai plugin install paperclip-agent-companies-plugin"
    );
  }
  if (agentCompaniesPlugin.status !== "ready") {
    throw new Error(
      `Plugin not ready (status=${agentCompaniesPlugin.status}, lastError=${
        agentCompaniesPlugin.lastError ?? "n/a"
      })`
    );
  }
  const pluginId = process.env.PAPERCLIP_PLUGIN_ID || agentCompaniesPlugin.id;
  console.log(`  pluginId: ${pluginId}`);

  step("Read catalog state (source company)");
  const catalogResponse = await call(
    `/plugins/${pluginId}/data/catalog.read`,
    { method: "POST", body: "{}" }
  );
  const catalogState = catalogResponse?.data ?? {};
  const sourceCompany = catalogState.companies?.[0];
  if (!sourceCompany) {
    throw new Error(
      "No source companies discovered. Add a Repository Catalog source pointing at paperclip/companies/indexflow/ first."
    );
  }
  console.log(
    `  sourceCompanyId: ${sourceCompany.id} (name=${sourceCompany.name}, v=${sourceCompany.version})`
  );
  console.log(
    `  agents in source: ${sourceCompany.contents.agents.length} (${sourceCompany.contents.agents
      .map((a) => a.name)
      .join(", ")})`
  );

  step("Resolve target Paperclip company (existing or new)");
  const companies = await call("/companies");
  let target;
  if (process.env.PAPERCLIP_TARGET_COMPANY_ID) {
    const existing = companies.find(
      (c) => c.id === process.env.PAPERCLIP_TARGET_COMPANY_ID
    );
    if (!existing) {
      throw new Error(
        `PAPERCLIP_TARGET_COMPANY_ID=${process.env.PAPERCLIP_TARGET_COMPANY_ID} not found in Paperclip company list.`
      );
    }
    target = existing;
  } else {
    target =
      companies.find((c) => c.name.toLowerCase() === "indexflow") ||
      companies[0];
  }
  if (!target) {
    throw new Error(
      "No Paperclip company to import INTO. Onboarding usually creates one — go to http://127.0.0.1:3100/onboarding first."
    );
  }
  console.log(`  targetCompanyId: ${target.id} (name=${target.name})`);

  step("Call catalog.prepare-company-import (flat shape — avoids the UI bug)");
  const prepared = await call(
    `/plugins/${pluginId}/actions/catalog.prepare-company-import`,
    {
      method: "POST",
      body: JSON.stringify({
        companyId: sourceCompany.id,
        selection: {
          agents: { mode: "all" },
          projects: { mode: "none" },
          tasks: { mode: "none" },
          issues: { mode: "none" },
          skills: { mode: "none" },
        },
      }),
    }
  );
  const preparedSource = prepared?.data?.source;
  if (!preparedSource) {
    throw new Error(
      `prepare-company-import returned no source: ${JSON.stringify(prepared)}`
    );
  }
  console.log(
    `  prepared source: ${preparedSource.type}, files=${
      Object.keys(preparedSource.files ?? {}).length
    } (${Object.keys(preparedSource.files ?? {}).join(", ")})`
  );

  step("POST /api/companies/import (the actual import — same call the UI makes after prepare)");
  const importInclude = {
    company: false, // existing_company target → don't overwrite company metadata
    agents: true,
    projects: false,
    issues: false,
    skills: false,
  };
  const importResult = await call("/companies/import", {
    method: "POST",
    body: JSON.stringify({
      source: preparedSource,
      include: importInclude,
      target: { mode: "existing_company", companyId: target.id },
      collisionStrategy: "replace",
    }),
  });
  console.log(
    `  imported: company=${importResult?.company?.name} (${
      importResult?.company?.id
    }), agents=${(importResult?.agents ?? []).length}`
  );
  for (const agent of importResult?.agents ?? []) {
    console.log(
      `    - ${agent.name} (role=${agent.role}, action=${agent.action ?? "n/a"})`
    );
  }

  step("Call catalog.record-company-import (link source ↔ target in plugin state)");
  await call(
    `/plugins/${pluginId}/actions/catalog.record-company-import`,
    {
      method: "POST",
      body: JSON.stringify({
        params: {
          sourceCompanyId: sourceCompany.id,
          importedCompanyId: target.id,
          importedCompanyName: target.name,
          selection: {
            agents: { mode: "all" },
            projects: { mode: "none" },
            tasks: { mode: "none" },
            issues: { mode: "none" },
            skills: { mode: "none" },
          },
        },
      }),
    }
  );
  console.log("  linked.");

  step("Verify agents now present in Paperclip");
  const agentsAfter = await call(`/companies/${target.id}/agents`);
  console.log(`  Paperclip company "${target.name}" now has ${agentsAfter.length} agents:`);
  for (const agent of agentsAfter) {
    console.log(
      `    - ${agent.name} (role=${agent.role}, adapter=${agent.adapterType}, status=${agent.status})`
    );
  }

  step("Done");
  console.log(`Open http://127.0.0.1:3100/instance/companies/${target.id} to see the imported agents.`);
}

main().catch((error) => {
  console.error(`\nFailed: ${error.message}`);
  process.exitCode = 1;
});
