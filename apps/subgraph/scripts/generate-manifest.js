#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const network = process.env.NETWORK || "anvil";
const templatePath = path.join(root, "subgraph.template.yaml");
const outputPath = path.join(root, "subgraph.yaml");
const networksPath = path.join(root, "networks.json");

const zeroAddress = /^0x0{40}$/i;

function fail(message) {
  console.error(`\n[generate-manifest] ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(templatePath)) fail(`Missing template: ${templatePath}`);
if (!fs.existsSync(networksPath)) fail(`Missing networks file: ${networksPath}`);

const template = fs.readFileSync(templatePath, "utf8");
const networks = JSON.parse(fs.readFileSync(networksPath, "utf8"));
const cfg = networks[network];

if (!cfg) {
  fail(`Unknown NETWORK='${network}'. Available: ${Object.keys(networks).join(", ")}`);
}

for (const key of ["basketFactory", "vaultAccounting", "oracleAdapter"]) {
  const item = cfg[key];
  if (!item || typeof item.address !== "string") {
    fail(`Missing ${key}.address for network '${network}' in networks.json`);
  }
  if (zeroAddress.test(item.address)) {
    fail(`Zero address for ${key}.address on network '${network}'. Update apps/subgraph/networks.json.`);
  }
  if (typeof item.startBlock !== "number" || item.startBlock < 0) {
    fail(`Invalid ${key}.startBlock for network '${network}'. Expected non-negative number.`);
  }
}

const replacements = {
  "{{network}}": network,
  "{{basketFactoryAddress}}": cfg.basketFactory.address,
  "{{basketFactoryStartBlock}}": String(cfg.basketFactory.startBlock),
  "{{vaultAccountingAddress}}": cfg.vaultAccounting.address,
  "{{vaultAccountingStartBlock}}": String(cfg.vaultAccounting.startBlock),
  "{{oracleAdapterAddress}}": cfg.oracleAdapter.address,
  "{{oracleAdapterStartBlock}}": String(cfg.oracleAdapter.startBlock),
};

let content = template;
for (const [key, value] of Object.entries(replacements)) {
  content = content.replaceAll(key, value);
}

fs.writeFileSync(outputPath, content);
console.log(`[generate-manifest] Wrote ${outputPath} for network '${network}'.`);
