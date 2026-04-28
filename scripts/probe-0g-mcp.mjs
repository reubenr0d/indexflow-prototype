#!/usr/bin/env node
// Spawns the 0g-storage MCP server over stdio and calls a few tools
// to verify end-to-end MCP wiring. Default mode does only read-only calls
// (`get_storage_info`, `state_get`) so it is safe even without 0G testnet funds.
//
// Use --write to additionally attempt a `state_set` (costs 0G testnet tokens).

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

// load .env into process.env if present
const envPath = resolve(projectRoot, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  }
}

const writeMode = process.argv.includes("--write");
process.env.ZG_PRIVATE_KEY = process.env.ZG_PRIVATE_KEY || process.env.PRIVATE_KEY;
process.env.AGENT_NAME = process.env.AGENT_NAME || "0g-vault-manager";

if (!process.env.ZG_PRIVATE_KEY) {
  console.error("ZG_PRIVATE_KEY/PRIVATE_KEY missing");
  process.exit(1);
}

const transport = new StdioClientTransport({
  command: "node",
  args: [resolve(projectRoot, "apps/mcps/0g-storage/index.js")],
  env: { ...process.env },
  cwd: projectRoot,
});

const client = new Client({ name: "0g-probe", version: "1.0.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log("Tools advertised:", tools.tools.map((t) => t.name).join(", "));

async function call(name, args = {}) {
  console.log(`\n→ ${name}(${JSON.stringify(args)})`);
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.[0]?.text;
  console.log(text);
  return res;
}

await call("get_storage_info");
await call("state_get", { key: "vault_address" });

if (writeMode) {
  console.log("\n--- WRITE MODE: attempting state_set (costs 0G testnet tokens) ---");
  await call("state_set", { key: "probe_test", value: { ts: Date.now(), note: "0G probe" } });

  console.log("\n--- WRITE MODE: attempting log_append (Log layer, no KV needed) ---");
  const appendRes = await call("log_append", {
    entry: { ts: Date.now(), kind: "probe", note: "0G storage Log roundtrip" },
  });
  let rootHash = null;
  try {
    const txt = appendRes.content?.[0]?.text;
    if (txt) rootHash = JSON.parse(txt).root_hash;
  } catch {}

  if (rootHash) {
    console.log(`\n--- WRITE MODE: log_read by root hash ${rootHash} ---`);
    await call("log_read", { rootHash });
  }
}

await client.close();
process.exit(0);
