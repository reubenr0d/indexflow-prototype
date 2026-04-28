#!/usr/bin/env node
// Quick connectivity + wallet probe for 0G testnet.
// Reads ZG_PRIVATE_KEY (or PRIVATE_KEY fallback) from env and:
//   1. Derives the wallet address
//   2. Queries the wallet balance on 0G EVM testnet
//   3. Pings the indexer + KV endpoints
// No on-chain writes. Safe to run.

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

// Tiny .env loader so we don't depend on a runtime flag
const envPath = resolve(projectRoot, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  }
}

const ZG_RPC_URL = process.env.ZG_RPC_URL || "https://evmrpc-testnet.0g.ai";
const ZG_INDEXER_RPC = process.env.ZG_INDEXER_RPC || "https://indexer-storage-testnet-turbo.0g.ai";
const ZG_KV_CLIENT_URL = process.env.ZG_KV_CLIENT_URL || "http://3.101.147.150:6789";
const ZG_PRIVATE_KEY = process.env.ZG_PRIVATE_KEY || process.env.PRIVATE_KEY || "";

console.log("0G Endpoint Probe");
console.log("  RPC:", ZG_RPC_URL);
console.log("  Indexer:", ZG_INDEXER_RPC);
console.log("  KV:", ZG_KV_CLIENT_URL);
console.log("  Key source:", process.env.ZG_PRIVATE_KEY ? "ZG_PRIVATE_KEY" : (process.env.PRIVATE_KEY ? "PRIVATE_KEY (fallback)" : "<none>"));

if (!ZG_PRIVATE_KEY) {
  console.error("\nNo ZG_PRIVATE_KEY or PRIVATE_KEY in env.");
  process.exit(1);
}

// ethers is pulled in transitively via @0glabs/0g-serving-broker at the root
const { ethers } = await import("ethers");

const wallet = new ethers.Wallet(ZG_PRIVATE_KEY);
const address = wallet.address;
console.log("\nWallet address:", address);

async function rpc(method, params = []) {
  const res = await fetch(ZG_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return res.json();
}

const chainIdRes = await rpc("eth_chainId");
const balRes = await rpc("eth_getBalance", [address, "latest"]);
const chainId = parseInt(chainIdRes.result, 16);
const balanceWei = BigInt(balRes.result || "0x0");
const balance = ethers.formatEther(balanceWei);
console.log("\n0G EVM RPC");
console.log("  chainId:", chainId, "(0G Galileo testnet = 16602)");
console.log("  balance:", balance, "0G");

async function head(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 5000);
  try {
    const r = await fetch(url, { method: "GET", signal: ac.signal });
    return `HTTP ${r.status}`;
  } catch (e) {
    return `ERR ${e.message}`;
  } finally {
    clearTimeout(t);
  }
}

console.log("\nIndexer:", await head(ZG_INDEXER_RPC));
console.log("KV:", await head(ZG_KV_CLIENT_URL));

if (balanceWei === 0n) {
  console.log("\nWallet has zero 0G testnet balance.");
  console.log("Fund it at https://faucet.0g.ai (paste address:", address + ")");
  console.log("Storage writes (state_set / log_append) will fail until funded.");
  console.log("Read-only ops (get_storage_info, state_get without prior data) still work.");
} else {
  console.log("\nWallet is funded — ready for read + write ops.");
}
