#!/usr/bin/env node
/**
 * Generates config.local.yaml with addresses from deployment JSON files.
 * 
 * Usage: node scripts/gen-local-config.js
 * 
 * Reads:
 *   - apps/web/src/config/local-deployment.json (hub)
 *   - apps/web/src/config/local-spoke-deployment.json (spoke)
 * 
 * Writes:
 *   - apps/envio/config.local.generated.yaml
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const WEB_CONFIG = resolve(ROOT, "..", "web", "src", "config");

function loadJson(path) {
  if (!existsSync(path)) {
    console.warn(`Warning: ${path} not found`);
    return null;
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function lc(addr) {
  return addr?.toLowerCase() ?? "";
}

const hub = loadJson(resolve(WEB_CONFIG, "local-deployment.json"));
const spoke = loadJson(resolve(WEB_CONFIG, "local-spoke-deployment.json")) ??
  loadJson(resolve(WEB_CONFIG, "spoke-deployment.json"));

if (!hub) {
  console.error("Hub deployment not found. Run: npm run deploy:local");
  process.exit(1);
}

const hubNetwork = {
  id: 31337,
  rpc_config: { url: "http://127.0.0.1:8545" },
  start_block: 0,
  contracts: [
    { name: "BasketFactory", address: lc(hub.basketFactory) },
    hub.vaultAccounting && { name: "VaultAccounting", address: lc(hub.vaultAccounting) },
    hub.oracleAdapter && { name: "OracleAdapter", address: lc(hub.oracleAdapter) },
    hub.stateRelay && { name: "StateRelay", address: lc(hub.stateRelay) },
    { name: "BasketVault" },
  ].filter(Boolean),
};

const spokeNetwork = spoke ? {
  id: 31338,
  rpc_config: { url: "http://127.0.0.1:8546" },
  start_block: 0,
  contracts: [
    { name: "BasketFactory", address: lc(spoke.basketFactory) },
    spoke.stateRelay && { name: "StateRelay", address: lc(spoke.stateRelay) },
    { name: "BasketVault" },
  ].filter(Boolean),
} : null;

const networks = [hubNetwork];
if (spokeNetwork) networks.push(spokeNetwork);

const config = {
  name: "snx-baskets-local",
  description: "SNX baskets indexer for local e2e testing (dual Anvil)",
  contracts: [
    {
      name: "BasketFactory",
      abi_file_path: "./abis/BasketFactory.json",
      handler: "./src/EventHandlers.ts",
      events: [{ event: "BasketCreated" }],
    },
    {
      name: "BasketVault",
      abi_file_path: "./abis/BasketVault.json",
      handler: "./src/EventHandlers.ts",
      events: [
        { event: "Deposited" },
        { event: "Redeemed" },
        { event: "AllocatedToPerp" },
        { event: "WithdrawnFromPerp" },
        { event: "AssetsUpdated" },
        { event: "FeesCollected" },
        { event: "ReservePolicyUpdated" },
        { event: "ReserveToppedUp" },
      ],
    },
    {
      name: "VaultAccounting",
      abi_file_path: "./abis/VaultAccounting.json",
      handler: "./src/EventHandlers.ts",
      events: [
        { event: "VaultRegistered" },
        { event: "VaultDeregistered" },
        { event: "AssetTokenMapped" },
        { event: "CapitalDeposited" },
        { event: "CapitalWithdrawn" },
        { event: "PositionOpened" },
        { event: "PositionClosed" },
        { event: "PnLRealized" },
        { event: "MaxOpenInterestSet" },
        { event: "MaxPositionSizeSet" },
        { event: "PauseToggled" },
      ],
    },
    {
      name: "OracleAdapter",
      abi_file_path: "./abis/OracleAdapter.json",
      handler: "./src/EventHandlers.ts",
      events: [
        { event: "AssetConfigured" },
        { event: "AssetRemoved" },
        { event: "PriceUpdated" },
      ],
    },
    {
      name: "StateRelay",
      abi_file_path: "./abis/StateRelay.json",
      handler: "./src/EventHandlers.ts",
      events: [{ event: "StateUpdated" }],
    },
  ],
  networks,
  unordered_multichain_mode: true,
  preload_handlers: false,
  address_format: "lowercase",
};

function toYaml(obj, indent = 0) {
  const spaces = "  ".repeat(indent);
  let out = "";

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (typeof item === "object" && item !== null) {
        const keys = Object.keys(item);
        if (keys.length === 1 && typeof item[keys[0]] === "string") {
          out += `${spaces}- ${keys[0]}: ${item[keys[0]]}\n`;
        } else {
          out += `${spaces}-`;
          let first = true;
          for (const [k, v] of Object.entries(item)) {
            if (first) {
              out += ` ${k}: ${formatValue(v, indent + 2, true)}\n`;
              first = false;
            } else {
              out += `${spaces}  ${k}: ${formatValue(v, indent + 2)}\n`;
            }
          }
        }
      } else {
        out += `${spaces}- ${obj}\n`;
      }
    }
  } else if (typeof obj === "object" && obj !== null) {
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined || v === null) continue;
      out += `${spaces}${k}: ${formatValue(v, indent + 1)}\n`;
    }
  }

  return out;
}

function formatValue(v, nextIndent, inline = false) {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    return `\n${toYaml(v, nextIndent)}`.trimEnd();
  }
  if (typeof v === "object" && v !== null) {
    if (inline) {
      const simple = Object.entries(v).map(([k, val]) => `${k}: ${val}`).join(", ");
      if (simple.length < 60 && !simple.includes("\n")) {
        return `{ ${simple} }`;
      }
    }
    return `\n${toYaml(v, nextIndent)}`.trimEnd();
  }
  return "";
}

const yaml = `# yaml-language-server: $schema=./node_modules/envio/evm.schema.json
# Auto-generated by scripts/gen-local-config.js — do not edit manually
${toYaml(config)}`;

const outPath = resolve(ROOT, "config.local.generated.yaml");
writeFileSync(outPath, yaml);

console.log("Generated:", outPath);
console.log("Hub contracts:", hub.basketFactory ? "OK" : "MISSING");
console.log("Spoke contracts:", spoke?.basketFactory ? "OK" : "MISSING (run spoke deploy)");
