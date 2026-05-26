#!/usr/bin/env node
/**
 * Fetches an oracle seed quote and writes a single 8-decimal USD raw integer to
 * `cache/yf-seed-price.txt` (UTF-8 digits only, no stdout).
 *
 * Yahoo first; allowlisted crypto falls back to Bybit index (same as keeper).
 * Used by DeployLocal / DeploySepolia via `vm.ffi` + `vm.readFile`.
 *
 * Usage: node scripts/fetch-yf-asset-price.js BHP.AX
 *        node scripts/fetch-yf-asset-price.js ETH-USD
 */

const fs = require("fs");
const path = require("path");

const symbol = process.argv[2];
if (!symbol) {
  console.error("usage: node scripts/fetch-yf-asset-price.js <SYMBOL>");
  process.exit(1);
}

const PRICE_DECIMALS = 8;
const outPath = path.join(__dirname, "..", "cache", "yf-seed-price.txt");

async function main() {
  const { fetchOracleSeedPriceUsd } = await import("../apps/shared/oracle-seed-price.mjs");
  const seed = await fetchOracleSeedPriceUsd(symbol);
  if (seed.priceUsd == null || seed.priceUsd <= 0) {
    throw new Error(`invalid seed price for ${symbol}`);
  }
  const raw = Math.round(seed.priceUsd * 10 ** PRICE_DECIMALS);
  if (raw <= 0 || !Number.isFinite(raw)) throw new Error("invalid raw price");

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, String(raw), "utf8");
  if (seed.source === "bybit-index") {
    console.error(`  seed via Bybit index (${seed.bybitSymbol}): $${seed.priceUsd}`);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
