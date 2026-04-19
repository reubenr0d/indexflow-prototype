#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const subgraphRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(subgraphRoot, "..", "..");
const networksPath = path.join(subgraphRoot, "networks.json");
const localDeploymentPath = path.join(repoRoot, "apps", "web", "src", "config", "local-deployment.json");
const sepoliaDeploymentPath = path.join(repoRoot, "apps", "web", "src", "config", "sepolia-deployment.json");
const fujiDeploymentPath = path.join(repoRoot, "apps", "web", "src", "config", "fuji-deployment.json");

const OPTIONAL_COORDINATION_KEYS = ["poolReserveRegistry", "intentRouter"];

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

function isZeroAddress(addr) {
  return typeof addr !== "string" || /^0x0{40}$/i.test(addr);
}

/**
 * When coordination contracts are not in the web deployment JSON (or are unset),
 * clear stale subgraph addresses so generate-manifest does not index wrong contracts.
 */
function syncOptionalCoordination(networks, networkName, deployment) {
  for (const key of OPTIONAL_COORDINATION_KEYS) {
    ensureTarget(networks, networkName, key);
    const v = deployment[key];
    if (typeof v !== "string" || v.length < 10 || isZeroAddress(v)) {
      networks[networkName][key].address = "0x0000000000000000000000000000000000000000";
      networks[networkName][key].startBlock = 0;
    }
  }
}

/**
 * Infer deployment block from Foundry broadcast receipts (Sepolia main deploy only).
 */
function inferSepoliaStartBlocksFromBroadcast(networks, deployment) {
  const broadcastPath = path.join(repoRoot, "broadcast", "Deploy.s.sol", "11155111", "run-latest.json");
  if (!fs.existsSync(broadcastPath)) {
    return;
  }
  let run;
  try {
    run = readJson(broadcastPath);
  } catch {
    return;
  }
  const receipts = Array.isArray(run.receipts) ? run.receipts : [];
  /** @type {Map<string, number>} */
  const addrToBlock = new Map();
  for (const r of receipts) {
    const ca = r.contractAddress;
    if (typeof ca !== "string" || !ca.startsWith("0x")) continue;
    const bn = r.blockNumber;
    if (bn === undefined || bn === null) continue;
    const block = typeof bn === "string" ? parseInt(bn, 16) : Number(bn);
    if (!Number.isFinite(block)) continue;
    const key = ca.toLowerCase();
    const prev = addrToBlock.get(key);
    if (prev === undefined || block < prev) addrToBlock.set(key, block);
  }
  const coreKeys = ["basketFactory", "vaultAccounting", "oracleAdapter"];
  for (const k of coreKeys) {
    const addr = deployment[k];
    if (typeof addr !== "string" || addr.length < 10) continue;
    const b = addrToBlock.get(addr.toLowerCase());
    if (b !== undefined) {
      ensureTarget(networks, "sepolia", k);
      networks.sepolia[k].startBlock = b;
    }
  }
}

const networks = readJson(networksPath);
const localDeployment = readJson(localDeploymentPath);
const sepoliaDeployment = readJson(sepoliaDeploymentPath);
const fujiDeployment = readJson(fujiDeploymentPath);

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
  syncTarget(networks, "fuji", fujiDeployment, deploymentKey, networkKey);
}

syncOptionalCoordination(networks, "anvil", localDeployment);
syncOptionalCoordination(networks, "sepolia", sepoliaDeployment);
syncOptionalCoordination(networks, "fuji", fujiDeployment);

inferSepoliaStartBlocksFromBroadcast(networks, sepoliaDeployment);

// Legacy key from earlier misconfiguration. Keep output canonical on Ethereum Sepolia.
if (networks["arbitrum-sepolia"]) {
  delete networks["arbitrum-sepolia"];
}

fs.writeFileSync(networksPath, `${JSON.stringify(networks, null, 2)}\n`);
console.log(`[sync-networks] Updated ${networksPath} from web deployment configs.`);
