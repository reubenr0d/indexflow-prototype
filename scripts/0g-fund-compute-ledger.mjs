#!/usr/bin/env node
/**
 * Funds the 0G Compute ledger for the configured wallet so that
 * `broker.inference.getRequestHeaders` can sign requests against the
 * provider sub-account.
 *
 * Usage:
 *   node scripts/0g-fund-compute-ledger.mjs [amount_in_0g]
 *
 * Default amount is 3.0 0G — the minimum required to *create* a new ledger
 * entry (SDK rejects anything less). Subsequent top-ups can be smaller.
 *
 * Prerequisites:
 *   1. Wallet (ZG_PRIVATE_KEY / PRIVATE_KEY) holds enough 0G testnet tokens
 *      from https://faucet.0g.ai
 *   2. ZG_COMPUTE_PROVIDER points at a live provider (see
 *      `node scripts/probe-0g-compute.mjs`)
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const envPath = resolve(projectRoot, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  }
}

const RPC = process.env.ZG_COMPUTE_RPC_URL || process.env.ZG_RPC_URL || "https://evmrpc-testnet.0g.ai";
const KEY = process.env.ZG_COMPUTE_PRIVATE_KEY || process.env.ZG_PRIVATE_KEY || process.env.PRIVATE_KEY;
const PROVIDER = process.env.ZG_COMPUTE_PROVIDER;
const AMOUNT = parseFloat(process.argv[2] || "3");

if (!KEY) {
  console.error("Missing ZG_PRIVATE_KEY / ZG_COMPUTE_PRIVATE_KEY / PRIVATE_KEY");
  process.exit(1);
}
if (!PROVIDER) {
  console.error("Missing ZG_COMPUTE_PROVIDER. Run `node scripts/probe-0g-compute.mjs` to find live providers.");
  process.exit(1);
}
if (!Number.isFinite(AMOUNT) || AMOUNT <= 0) {
  console.error(`Invalid amount: ${process.argv[2]}`);
  process.exit(1);
}

const { ethers } = await import("ethers");
const { createZGComputeNetworkBroker } = await import("@0glabs/0g-serving-broker");

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(KEY, provider);
const balance = await provider.getBalance(wallet.address);

console.log("Wallet:", wallet.address);
console.log("On-chain balance:", ethers.formatEther(balance), "0G");
console.log("Provider:", PROVIDER);
console.log("Deposit amount:", AMOUNT, "0G");

if (balance === 0n) {
  console.error(
    `\nWallet has 0 0G testnet balance. Fund ${wallet.address} at https://faucet.0g.ai before depositing to the compute ledger.`
  );
  process.exit(1);
}

console.log("\nInitializing broker...");
const broker = await createZGComputeNetworkBroker(wallet);

function jsonBig(obj) {
  return JSON.stringify(obj, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);
}

try {
  console.log("Reading current ledger state...");
  const before = await broker.ledger.getLedger();
  console.log("Ledger before:", jsonBig(before));
} catch (err) {
  console.log("No ledger entry yet (will be created):", err.message);
}

console.log(`\nDepositing ${AMOUNT} 0G to ledger...`);
const tx = await broker.ledger.depositFund(AMOUNT);
console.log("Deposit tx:", tx);

console.log("\nAcknowledging provider (one-time)...");
try {
  await broker.inference.acknowledgeProviderSigner(PROVIDER);
  console.log("Acknowledged.");
} catch (err) {
  console.log("acknowledgeProviderSigner:", err.message);
}

console.log("\nReading post-deposit ledger state...");
const after = await broker.ledger.getLedger();
console.log("Ledger after:", jsonBig(after));

console.log("\nDone. Try `npm run agent:0g:dry` again — 0G Compute should now sign requests.");
process.exit(0);
