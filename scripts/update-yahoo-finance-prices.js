#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const DEFAULT_DEPLOYMENT_CONFIG = "apps/web/src/config/sepolia-deployment.json";
const DEFAULT_RPC_URL = "sepolia";
const PRICE_DECIMALS = 8;

function resolvePath(input, fallback) {
  const candidate = input ?? fallback;
  return path.isAbsolute(candidate) ? candidate : path.join(process.cwd(), candidate);
}

function toBool(value) {
  if (!value) return false;
  return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
}

function runCast(args, inherit = false) {
  const options = inherit
    ? { stdio: "inherit" }
    : { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] };
  return execFileSync("cast", args, options);
}

function loadRootEnv() {
  const repoRoot = path.resolve(__dirname, "..");
  for (const name of [".env", ".env.local"]) {
    const envPath = path.join(repoRoot, name);
    if (!fs.existsSync(envPath)) continue;
    const lines = fs.readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

async function enumerateOnChainAssets(oracleAdapter, rpcUrl) {
  const countHex = runCast([
    "call", oracleAdapter,
    "getAssetCount()(uint256)",
    "--rpc-url", rpcUrl,
  ]).trim();
  const count = parseInt(countHex, 10) || parseInt(countHex, 16) || 0;
  console.log(`On-chain asset count: ${count}`);

  const assets = [];
  for (let i = 0; i < count; i++) {
    const assetId = runCast([
      "call", oracleAdapter,
      "assetList(uint256)(bytes32)",
      String(i),
      "--rpc-url", rpcUrl,
    ]).trim();

    const configRaw = runCast([
      "call", oracleAdapter,
      "getAssetConfig(bytes32)((address,uint8,uint256,uint256,uint8,bool))",
      assetId,
      "--rpc-url", rpcUrl,
    ]).trim();

    const feedTypeMatch = configRaw.match(/,\s*(\d+)\s*,/);
    const feedType = feedTypeMatch ? parseInt(feedTypeMatch[1], 10) : -1;

    const activeMatch = configRaw.match(/,\s*(true|false)\s*\)/);
    const active = activeMatch ? activeMatch[1] === "true" : false;

    if (feedType !== 1 || !active) continue;

    const symbolRaw = runCast([
      "call", oracleAdapter,
      "assetSymbols(bytes32)(string)",
      assetId,
      "--rpc-url", rpcUrl,
    ]).trim();

    const symbol = symbolRaw.replace(/^"|"$/g, "");
    if (!symbol) {
      console.warn(`  WARNING: asset ${assetId.slice(0, 18)}... has empty symbol, skipping`);
      continue;
    }

    assets.push({ assetId, symbol });
  }

  return assets;
}

async function fetchYahooQuotes(symbols) {
  const YahooFinance = require("yahoo-finance2").default;
  const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  const quotes = {};
  for (const symbol of symbols) {
    try {
      const q = await yf.quote(symbol);
      quotes[symbol] = {
        price: q.regularMarketPrice,
        currency: q.currency ?? "USD",
        marketState: q.marketState ?? "CLOSED",
      };
    } catch (err) {
      console.warn(`  WARNING: could not fetch quote for ${symbol}: ${err.message}`);
    }
  }
  return quotes;
}

async function getFxRates(currencies) {
  const unique = [...new Set(currencies.filter((c) => c !== "USD"))];
  if (unique.length === 0) return new Map();

  const YahooFinance = require("yahoo-finance2").default;
  const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  const rates = new Map();
  for (const cur of unique) {
    const pair = `${cur}USD=X`;
    const q = await yf.quote(pair);
    const rate = q.regularMarketPrice;
    if (!rate || rate <= 0) {
      throw new Error(`Could not fetch FX rate for ${pair}`);
    }
    rates.set(cur, rate);
    console.log(`  FX ${cur}/USD = ${rate}`);
  }
  return rates;
}

function toRawPrice(usdPrice) {
  return BigInt(Math.round(usdPrice * 10 ** PRICE_DECIMALS));
}

async function main() {
  loadRootEnv();

  const deploymentConfigPath = resolvePath(process.env.DEPLOYMENT_CONFIG, DEFAULT_DEPLOYMENT_CONFIG);
  const rpcUrl = process.env.RPC_URL ?? DEFAULT_RPC_URL;
  const dryRun = toBool(process.env.DRY_RUN);
  const privateKey = process.env.PRIVATE_KEY;

  if (!dryRun && !privateKey) {
    throw new Error("PRIVATE_KEY is required unless DRY_RUN is enabled");
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentConfigPath, "utf8"));
  const oracleAdapter = deployment.oracleAdapter;
  const priceSync = deployment.priceSync;
  if (!oracleAdapter || !priceSync) {
    throw new Error("deployment config must include oracleAdapter and priceSync");
  }

  console.log(`Deployment config: ${deploymentConfigPath}`);
  console.log(`RPC URL:           ${rpcUrl}`);
  console.log("");

  console.log("Enumerating on-chain CustomRelayer assets...");
  const assets = await enumerateOnChainAssets(oracleAdapter, rpcUrl);
  if (assets.length === 0) {
    console.log("No active CustomRelayer assets found on-chain.");
    return;
  }
  console.log(`Found ${assets.length} active CustomRelayer asset(s):\n`);

  const symbols = assets.map((a) => a.symbol);
  console.log("Fetching Yahoo Finance quotes...");
  const quotes = await fetchYahooQuotes(symbols);

  const currencies = assets.map((a) => quotes[a.symbol]?.currency ?? "USD");
  console.log("\nFetching FX rates...");
  const fxRates = await getFxRates(currencies);

  console.log("");

  const assetIds = [];
  const rawPrices = [];

  for (const asset of assets) {
    const quote = quotes[asset.symbol];
    if (!quote || quote.price == null || quote.price <= 0) {
      console.warn(`  SKIP ${asset.symbol}: no valid quote`);
      continue;
    }

    const currency = quote.currency ?? "USD";
    const fxRate = currency === "USD" ? 1 : fxRates.get(currency);
    if (fxRate == null) {
      console.warn(`  SKIP ${asset.symbol}: missing FX rate for ${currency}`);
      continue;
    }

    const usdPrice = quote.price * fxRate;
    const rawPrice = toRawPrice(usdPrice);

    assetIds.push(asset.assetId);
    rawPrices.push(rawPrice.toString());

    console.log(
      `${asset.symbol.padEnd(12)} ` +
      `local=${quote.price.toFixed(4)} ${currency}  fx=${fxRate.toFixed(4)}  ` +
      `usd=${usdPrice.toFixed(4)}  raw=${rawPrice}  id=${asset.assetId.slice(0, 18)}...`
    );
  }

  if (assetIds.length === 0) {
    console.log("\nNo prices to submit.");
    return;
  }

  const assetIdArg = `[${assetIds.join(",")}]`;
  const pricesArg = `[${rawPrices.join(",")}]`;

  console.log("");
  console.log(`OracleAdapter: ${oracleAdapter}`);
  console.log(`PriceSync:     ${priceSync}`);
  console.log(`submitPrices:  ${assetIds.length} asset(s)`);

  if (dryRun) {
    console.log("\nDRY_RUN enabled: skipping transactions.");
    return;
  }

  runCast(
    [
      "send", oracleAdapter,
      "submitPrices(bytes32[],uint256[])",
      assetIdArg, pricesArg,
      "--private-key", privateKey,
      "--rpc-url", rpcUrl,
    ],
    true
  );

  runCast(
    [
      "send", priceSync,
      "syncAll()",
      "--private-key", privateKey,
      "--rpc-url", rpcUrl,
    ],
    true
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
