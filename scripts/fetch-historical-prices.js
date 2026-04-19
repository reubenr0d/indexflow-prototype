#!/usr/bin/env node
/**
 * Fetches historical daily close prices from Yahoo Finance for a list of
 * oracle symbols, converts to 8-decimal USD raw integers, and writes the
 * result to cache/historical-prices.json for consumption by Forge seed scripts.
 *
 * Supports oracle→Yahoo symbol mapping for assets whose Yahoo ticker differs
 * from the on-chain oracle symbol (e.g. XAU→GC=F, XAG→SI=F).
 *
 * Usage:
 *   node scripts/fetch-historical-prices.js BHP.AX XAU XAG GLEN.L
 *
 * Environment:
 *   SEED_DAYS  - number of calendar days of history (default 90)
 */

const fs = require("fs");
const path = require("path");

const PRICE_DECIMALS = 8;
const DEFAULT_DAYS = 90;

// Maps oracle symbol → Yahoo Finance ticker when they differ.
// Gold/silver commodity codes are not quoteable on Yahoo; use COMEX futures.
const YAHOO_SYMBOL_MAP = {
  XAU: "GC=F",
  XAG: "SI=F",
};

const oracleSymbols = process.argv.slice(2);
if (oracleSymbols.length === 0) {
  console.error("usage: node scripts/fetch-historical-prices.js <SYMBOL> [SYMBOL ...]");
  process.exit(1);
}

const seedDays = parseInt(process.env.SEED_DAYS ?? String(DEFAULT_DAYS), 10);
const outPath = path.join(__dirname, "..", "cache", "historical-prices.json");

function toAssetIdKeccak(symbol) {
  try {
    const { keccak256, toUtf8Bytes } = require("ethers");
    return keccak256(toUtf8Bytes(symbol));
  } catch {
    const { execFileSync } = require("child_process");
    const hex = execFileSync("cast", ["keccak", symbol], {
      encoding: "utf8",
    }).trim();
    return hex;
  }
}

async function fetchFxRate(yf, currency) {
  if (currency === "USD") return 1;
  // GBp = British pence; fetch GBP/USD and divide by 100
  const baseCurrency = currency === "GBp" ? "GBP" : currency;
  const pair = `${baseCurrency}USD=X`;
  const q = await yf.quote(pair);
  const rate = q.regularMarketPrice;
  if (!rate || rate <= 0) throw new Error(`missing FX for ${baseCurrency}`);
  const effectiveRate = currency === "GBp" ? rate / 100 : rate;
  console.log(`  FX ${currency}/USD = ${effectiveRate.toFixed(6)}`);
  return effectiveRate;
}

function toRaw8(usdPrice) {
  return Math.round(usdPrice * 10 ** PRICE_DECIMALS);
}

async function main() {
  const YahooFinance = require("yahoo-finance2").default;
  const yf = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

  const now = new Date();
  const period1 = new Date(now);
  period1.setDate(period1.getDate() - seedDays);

  const fxCache = {};
  const result = {};

  for (const oracleSymbol of oracleSymbols) {
    const yahooSymbol = YAHOO_SYMBOL_MAP[oracleSymbol] ?? oracleSymbol;
    console.log(
      `\nFetching ${seedDays}d history for ${oracleSymbol}` +
        (yahooSymbol !== oracleSymbol ? ` (Yahoo: ${yahooSymbol})` : "") +
        "..."
    );

    let rows;
    try {
      rows = await yf.chart(yahooSymbol, {
        period1: period1.toISOString().slice(0, 10),
        period2: now.toISOString().slice(0, 10),
        interval: "1d",
      });
    } catch (err) {
      console.warn(`  WARNING: could not fetch history for ${yahooSymbol}: ${err.message}`);
      continue;
    }

    const quotes = rows?.quotes;
    if (!quotes || quotes.length === 0) {
      console.warn(`  WARNING: no data returned for ${yahooSymbol}`);
      continue;
    }

    // Determine currency from chart metadata or a live quote
    let currency = rows?.meta?.currency ?? "USD";
    if (currency === "USD" && yahooSymbol !== oracleSymbol) {
      // Futures like GC=F are already in USD
    } else if (currency === "USD") {
      try {
        const q = await yf.quote(yahooSymbol);
        currency = q.currency ?? "USD";
      } catch {
        // default USD
      }
    }

    if (!(currency in fxCache)) {
      fxCache[currency] = await fetchFxRate(yf, currency);
    }
    const fxRate = fxCache[currency];

    // Sort chronologically
    quotes.sort((a, b) => new Date(a.date) - new Date(b.date));

    const prices = [];
    const timestamps = [];

    for (const row of quotes) {
      const close = row.close ?? row.adjclose;
      if (close == null || close <= 0) continue;

      const usd = close * fxRate;
      const raw = toRaw8(usd);
      if (raw <= 0) continue;

      const ts = Math.floor(new Date(row.date).getTime() / 1000);
      prices.push(raw);
      timestamps.push(ts);
    }

    if (prices.length === 0) {
      console.warn(`  WARNING: no valid price rows for ${oracleSymbol}`);
      continue;
    }

    const assetId = toAssetIdKeccak(oracleSymbol);

    // Sanitize key for Forge vm.parseJson (dots are path separators)
    const jsonKey = oracleSymbol.replace(/\./g, "_");
    result[jsonKey] = { symbol: oracleSymbol, assetId, prices, timestamps };

    console.log(
      `  ${prices.length} data points, ` +
        `range ${new Date(timestamps[0] * 1000).toISOString().slice(0, 10)} → ` +
        `${new Date(timestamps[timestamps.length - 1] * 1000).toISOString().slice(0, 10)}, ` +
        `latest raw=${prices[prices.length - 1]} ($${(prices[prices.length - 1] / 1e8).toFixed(2)})`
    );
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n", "utf8");
  console.log(`\nWrote ${outPath}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
