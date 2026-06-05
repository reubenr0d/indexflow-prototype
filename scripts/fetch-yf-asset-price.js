#!/usr/bin/env node
/**
 * Fetches a Yahoo Finance quote and writes a single 8-decimal USD raw integer to
 * `cache/yf-seed-price.txt` (UTF-8 digits only, no stdout).
 *
 * Used by DeployLocal / DeploySepolia via `vm.ffi` + `vm.readFile`. We avoid piping
 * the price on stdout: some Forge versions treat `ffi` stdout in ways that corrupt
 * pure decimal ASCII (e.g. digit pairs decoded as bytes).
 *
 * Usage: node scripts/fetch-yf-asset-price.js BHP.AX
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

function fxBaseCurrency(currency) {
  return currency === "GBp" ? "GBP" : currency;
}

function usdRateForQuoteCurrency(currency, rate) {
  return currency === "GBp" ? rate / 100 : rate;
}

async function main() {
  const YahooFinance = require("yahoo-finance2").default;
  const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  const q = await yf.quote(symbol);
  if (q.regularMarketPrice == null || q.regularMarketPrice <= 0) {
    throw new Error(`invalid quote for ${symbol}`);
  }
  const currency = q.currency ?? "USD";
  let usd = q.regularMarketPrice;
  if (currency !== "USD") {
    const baseCurrency = fxBaseCurrency(currency);
    const pair = `${baseCurrency}USD=X`;
    const fx = await yf.quote(pair);
    const rate = fx.regularMarketPrice;
    if (!rate || rate <= 0) throw new Error(`missing FX for ${currency}`);
    usd = q.regularMarketPrice * usdRateForQuoteCurrency(currency, rate);
  }
  const raw = Math.round(usd * 10 ** PRICE_DECIMALS);
  if (raw <= 0 || !Number.isFinite(raw)) throw new Error("invalid raw price");

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, String(raw), "utf8");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
