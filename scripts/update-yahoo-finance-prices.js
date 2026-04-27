#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const DEFAULT_DEPLOYMENT_CONFIG = "apps/web/src/config/sepolia-deployment.json";
const DEFAULT_RPC_URL = "sepolia";
/** Used when inferring chain for KeeperHub (API wants "sepolia", not the RPC URL). */
const DEFAULT_KEEPERHUB_NETWORK = "sepolia";
const PRICE_DECIMALS = 8;

// KeeperHub integration for reliable transaction execution
let keeperHubClient = null;

async function initKeeperHub() {
  if (process.env.KEEPERHUB_API_KEY) {
    try {
      const { KeeperHubClient } = await import("../lib/keeperhub.mjs");
      keeperHubClient = KeeperHubClient.fromEnv();
      if (keeperHubClient) {
        console.log("[KeeperHub] Enabled for transaction execution");
      }
    } catch (err) {
      console.warn(`[KeeperHub] Init failed, using direct execution: ${err.message}`);
    }
  }
}

function resolvePath(input, fallback) {
  const candidate = input ?? fallback;
  return path.isAbsolute(candidate) ? candidate : path.join(process.cwd(), candidate);
}

/**
 * KeeperHub's execute API expects a short network id (e.g. "sepolia"), not `RPC_URL`
 * (an https URL is rejected as "Unsupported network" and is redacted in CI logs as "***").
 */
function resolveKeeperHubNetwork(deploymentConfigPath) {
  const fromEnv = process.env.KEEPERHUB_NETWORK || process.env.AGENT_NETWORK;
  if (fromEnv) return fromEnv;
  const base = path.basename(deploymentConfigPath, ".json");
  const m = base.match(/^([a-z0-9-]+)-deployment$/i);
  if (m) {
    // arbitrum-sepolia-deployment.json -> arbitrum-sepolia; map to KeeperHub id if we add aliases later
    return m[1].toLowerCase();
  }
  return DEFAULT_KEEPERHUB_NETWORK;
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

// ABI fragments for KeeperHub execution (JSON format)
const ORACLE_ADAPTER_ABI = [
  {
    "inputs": [
      { "name": "assetIds", "type": "bytes32[]" },
      { "name": "prices", "type": "uint256[]" }
    ],
    "name": "submitPrices",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

const PRICE_SYNC_ABI = [
  {
    "inputs": [],
    "name": "syncAll",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

async function executeViaKeeperHub(network, contractAddress, functionName, functionArgs, abi, justification) {
  if (!keeperHubClient) return false;

  try {
    console.log(`\n[KeeperHub] Executing ${functionName} on ${contractAddress.slice(0, 10)}...`);

    const result = await keeperHubClient.executeAndWait(
      {
        network,
        contractAddress,
        functionName,
        functionArgs,
        abi,
        justification,
      },
      {
        onPoll: (status, attempt) => {
          if (attempt > 0 && attempt % 5 === 0) {
            console.log(`[KeeperHub] Still waiting... status=${status.status}`);
          }
        },
      }
    );

    if (result.success) {
      console.log(`[KeeperHub] ✓ ${functionName} confirmed: ${result.transactionHash}`);
      if (result.explorerUrl) {
        console.log(`[KeeperHub]   Explorer: ${result.explorerUrl}`);
      }
    } else {
      const { formatKeeperHubFailureResult: fmtFail } = await import("../lib/keeperhub.mjs");
      const detail = result.error || fmtFail(result);
      console.error(`[KeeperHub] ✗ ${functionName} failed: ${detail}`);
      if (result.executionId) {
        console.error(`[KeeperHub]   executionId=${result.executionId} status=${result.status}`);
        try {
          const logs = await keeperHubClient.getExecutionLogs(result.executionId);
          console.error(
            `[KeeperHub]   logs (retries=${logs.retryCount}, gasEstimates=${logs.gasEstimates.length}):`
          );
          const summary = logs.logs.length > 0 ? logs.logs : logs.raw;
          console.error(JSON.stringify(summary, null, 2));
        } catch (logErr) {
          console.error(`[KeeperHub]   could not fetch execution logs: ${logErr.message}`);
        }
      }
    }

    return result.success;
  } catch (err) {
    console.error(`[KeeperHub] Error: ${err.message}`);
    return false;
  }
}

async function main() {
  loadRootEnv();

  // Initialize KeeperHub if configured
  await initKeeperHub();

  const deploymentConfigPath = resolvePath(process.env.DEPLOYMENT_CONFIG, DEFAULT_DEPLOYMENT_CONFIG);
  const rpcUrl = process.env.RPC_URL ?? DEFAULT_RPC_URL;
  const dryRun = toBool(process.env.DRY_RUN);
  const privateKey = process.env.PRIVATE_KEY;
  const useKeeperHub = keeperHubClient !== null;

  if (!dryRun && !privateKey && !useKeeperHub) {
    throw new Error("PRIVATE_KEY is required unless DRY_RUN or KEEPERHUB_API_KEY is set");
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentConfigPath, "utf8"));
  const oracleAdapter = deployment.oracleAdapter;
  const priceSync = deployment.priceSync;
  if (!oracleAdapter || !priceSync) {
    throw new Error("deployment config must include oracleAdapter and priceSync");
  }

  const keeperHubNetwork = resolveKeeperHubNetwork(deploymentConfigPath);

  console.log(`Deployment config: ${deploymentConfigPath}`);
  console.log(`RPC URL:           ${rpcUrl}`);
  if (useKeeperHub) {
    console.log(`KeeperHub network: ${keeperHubNetwork}`);
  }
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

  // Execute via KeeperHub if configured, otherwise use direct cast
  if (useKeeperHub) {
    console.log("\n[KeeperHub] Executing transactions via KeeperHub...");

    // Submit prices (use string representation for large numbers)
    const submitSuccess = await executeViaKeeperHub(
      keeperHubNetwork,
      oracleAdapter,
      "submitPrices",
      [assetIds, rawPrices],
      ORACLE_ADAPTER_ABI,
      `Price update: ${assetIds.length} assets`
    );

    if (!submitSuccess) {
      throw new Error("submitPrices failed via KeeperHub");
    }

    // Sync prices to GMX
    const syncSuccess = await executeViaKeeperHub(
      keeperHubNetwork,
      priceSync,
      "syncAll",
      [],
      PRICE_SYNC_ABI,
      "Sync oracle prices to GMX"
    );

    if (!syncSuccess) {
      throw new Error("syncAll failed via KeeperHub");
    }

    console.log("\n[KeeperHub] Price update complete.");
  } else {
    // Direct execution via cast
    console.log("\nExecuting transactions via cast...");

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
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
