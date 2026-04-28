#!/usr/bin/env node
// Lists currently active 0G Compute inference providers from the marketplace.
// Read-only; uses your funded ZG_PRIVATE_KEY (no payments triggered).

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

const ZG_RPC_URL = process.env.ZG_COMPUTE_RPC_URL || process.env.ZG_RPC_URL || "https://evmrpc-testnet.0g.ai";
const ZG_KEY = process.env.ZG_COMPUTE_PRIVATE_KEY || process.env.ZG_PRIVATE_KEY || process.env.PRIVATE_KEY;
if (!ZG_KEY) { console.error("No private key in env"); process.exit(1); }

const { ethers } = await import("ethers");
const { createZGComputeNetworkBroker } = await import("@0glabs/0g-serving-broker");

const provider = new ethers.JsonRpcProvider(ZG_RPC_URL);
const wallet = new ethers.Wallet(ZG_KEY, provider);
console.log("Wallet:", wallet.address);
const balance = await provider.getBalance(wallet.address);
console.log("Balance:", ethers.formatEther(balance), "0G");

console.log("\nInitializing 0G Compute broker...");
const broker = await createZGComputeNetworkBroker(wallet);

console.log("Listing services...");
const services = await broker.inference.listService();
if (!services || services.length === 0) {
  console.log("No services returned by broker.inference.listService()");
  process.exit(0);
}
for (const s of services) {
  console.log("---");
  console.log("provider:", s.provider);
  console.log("model:", s.model);
  console.log("serviceType:", s.serviceType);
  console.log("url:", s.url);
  console.log("inputPrice:", String(s.inputPrice));
  console.log("outputPrice:", String(s.outputPrice));
  console.log("verifiability:", s.verifiability);
}
process.exit(0);
