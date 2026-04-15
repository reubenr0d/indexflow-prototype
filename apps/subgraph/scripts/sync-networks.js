#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const subgraphRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(subgraphRoot, "..", "..");
const networksPath = path.join(subgraphRoot, "networks.json");
const localDeploymentPath = path.join(repoRoot, "apps", "web", "src", "config", "local-deployment.json");
const sepoliaDeploymentPath = path.join(repoRoot, "apps", "web", "src", "config", "sepolia-deployment.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureNetwork(networks, name) {
  if (!networks[name]) {
    networks[name] = {};
  }
}

function ensureTarget(networks, networkName, key) {
  ensureNetwork(networks, networkName);
  if (!networks[networkName][key]) {
    networks[networkName][key] = { address: "0x0000000000000000000000000000000000000000", startBlock: 0 };
  }
  if (typeof networks[networkName][key].startBlock !== "number" || networks[networkName][key].startBlock < 0) {
    networks[networkName][key].startBlock = 0;
  }
}

function syncTarget(networks, networkName, deployment, deploymentKey, networkKey) {
  ensureTarget(networks, networkName, networkKey);
  const address = deployment[deploymentKey];
  if (typeof address === "string" && address.length > 0) {
    networks[networkName][networkKey].address = address;
  }
}

const networks = readJson(networksPath);
const localDeployment = readJson(localDeploymentPath);
const sepoliaDeployment = readJson(sepoliaDeploymentPath);

const targets = [
  ["basketFactory", "basketFactory"],
  ["vaultAccounting", "vaultAccounting"],
  ["oracleAdapter", "oracleAdapter"],
  ["poolReserveRegistry", "poolReserveRegistry"],
  ["intentRouter", "intentRouter"],
];

for (const [deploymentKey, networkKey] of targets) {
  syncTarget(networks, "anvil", localDeployment, deploymentKey, networkKey);
  syncTarget(networks, "sepolia", sepoliaDeployment, deploymentKey, networkKey);
}

// Legacy key from earlier misconfiguration. Keep output canonical on Ethereum Sepolia.
if (networks["arbitrum-sepolia"]) {
  delete networks["arbitrum-sepolia"];
}

fs.writeFileSync(networksPath, `${JSON.stringify(networks, null, 2)}\n`);
console.log(`[sync-networks] Updated ${networksPath} from web deployment configs.`);
