#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const DEFAULT_DEPLOYMENT_CONFIG = "apps/web/src/config/sepolia-deployment.json";
const DEFAULT_RPC_URL = "sepolia";
const PRICE_DECIMALS = 8;
const ORACLE_BPS = 10_000n;

function resolvePath(input, fallback) {
  const candidate = input ?? fallback;
  return path.isAbsolute(candidate) ? candidate : path.join(process.cwd(), candidate);
}

function toBool(value) {
  if (!value) return false;
  return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
}

// Redactor is loaded lazily so this CommonJS script can pull from the ESM
// helper. Set in main() before any potentially-failing cast invocation.
let _redactSecrets = (s) => s;

// SECURITY: Foundry `cast send` does NOT read `ETH_PRIVATE_KEY` from env
// (only the keystore options have env support — see the long comment in
// apps/mcps/vault-manager/index.js for the full explanation). The raw key
// has to be passed on argv. The redactor below scrubs any leaked output
// (error message, stdout, stderr) before it can reach a log file or be
// echoed to the runner. GitHub Actions additionally masks the literal
// secret value in runner logs.
function runCast(args, { echo = false } = {}) {
  try {
    const out = execFileSync("cast", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (echo && out) {
      process.stdout.write(_redactSecrets(out));
    }
    return out;
  } catch (err) {
    const safeMessage = _redactSecrets(err.message || String(err));
    const safeStdout = err.stdout ? _redactSecrets(String(err.stdout)) : "";
    const safeStderr = err.stderr ? _redactSecrets(String(err.stderr)) : "";
    if (safeStdout) process.stdout.write(safeStdout);
    if (safeStderr) process.stderr.write(safeStderr);
    const wrapped = new Error(safeMessage);
    if (err.code) wrapped.code = err.code;
    throw wrapped;
  }
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

function normalizePrice(rawPrice, feedDecimals) {
  const decimals = BigInt(feedDecimals);
  if (decimals < 30n) {
    return rawPrice * (10n ** (30n - decimals));
  }
  return rawPrice;
}

function computeDeviationBps(oldPrice, newPrice) {
  if (oldPrice === 0n) return 0n;
  const diff = newPrice > oldPrice ? (newPrice - oldPrice) : (oldPrice - newPrice);
  return (diff * ORACLE_BPS) / oldPrice;
}

function parseAssetConfig(raw) {
  const cleaned = raw.trim().replace(/^\(|\)$/g, "");
  const parts = cleaned.split(",").map((p) => p.trim());
  if (parts.length !== 6) {
    throw new Error(`Unexpected asset config shape: ${raw}`);
  }
  return {
    feedAddress: parts[0],
    feedType: Number(parts[1]),
    stalenessThreshold: BigInt(parts[2]),
    deviationBps: BigInt(parts[3]),
    decimals: Number(parts[4]),
    active: parts[5] === "true",
  };
}

function parsePriceTuple(raw) {
  const cleaned = raw.trim().replace(/^\(|\)$/g, "");
  const parts = cleaned.split(",").map((p) => p.trim());
  if (parts.length !== 2) {
    throw new Error(`Unexpected price tuple shape: ${raw}`);
  }
  return {
    price: BigInt(parts[0]),
    timestamp: BigInt(parts[1]),
  };
}

function classifyPriceCandidate(existingPrice, newPriceNormalized, maxDeviationBps) {
  if (existingPrice === 0n) {
    return { status: "normal", deviationBps: 0n };
  }
  const deviationBps = computeDeviationBps(existingPrice, newPriceNormalized);
  if (deviationBps > maxDeviationBps) {
    return { status: "override-required", deviationBps };
  }
  return { status: "normal", deviationBps };
}

async function main() {
  loadRootEnv();

  const redactMod = await import("./lib/redact-secrets.mjs");
  _redactSecrets = redactMod.redactSecrets;

  const deploymentConfigPath = resolvePath(process.env.DEPLOYMENT_CONFIG, DEFAULT_DEPLOYMENT_CONFIG);
  const rpcUrl = process.env.RPC_URL ?? DEFAULT_RPC_URL;
  const dryRun = toBool(process.env.DRY_RUN);
  const privateKey = process.env.PRIVATE_KEY;
  const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY || process.env.PRIVATE_KEY;

  if (!dryRun && !privateKey) {
    throw new Error("PRIVATE_KEY is required unless DRY_RUN is set");
  }
  if (!dryRun && !adminPrivateKey) {
    throw new Error("ADMIN_PRIVATE_KEY (or PRIVATE_KEY fallback) is required unless DRY_RUN is set");
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

  const candidates = [];
  const summary = {
    totalCandidates: assets.length,
    quoted: 0,
    overriddenSuccess: 0,
    overriddenFailed: 0,
    keeperSubmitted: 0,
    skipped: 0,
  };

  for (const asset of assets) {
    const quote = quotes[asset.symbol];
    if (!quote || quote.price == null || quote.price <= 0) {
      console.warn(`  SKIP ${asset.symbol}: no valid quote`);
      summary.skipped += 1;
      continue;
    }

    const currency = quote.currency ?? "USD";
    const fxRate = currency === "USD" ? 1 : fxRates.get(currency);
    if (fxRate == null) {
      console.warn(`  SKIP ${asset.symbol}: missing FX rate for ${currency}`);
      summary.skipped += 1;
      continue;
    }

    const usdPrice = quote.price * fxRate;
    const rawPrice = toRawPrice(usdPrice);
    summary.quoted += 1;

    console.log(
      `${asset.symbol.padEnd(12)} ` +
      `local=${quote.price.toFixed(4)} ${currency}  fx=${fxRate.toFixed(4)}  ` +
      `usd=${usdPrice.toFixed(4)}  raw=${rawPrice}  id=${asset.assetId.slice(0, 18)}...`
    );

    candidates.push({
      ...asset,
      currency,
      fxRate,
      usdPrice,
      rawPrice,
    });
  }

  if (candidates.length === 0) {
    console.log("\nNo prices to submit.");
    console.log("\nSummary:");
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const keepersAssetIds = [];
  const keepersRawPrices = [];
  const overrideRequired = [];

  console.log("\nPreflight deviation checks...");
  for (const candidate of candidates) {
    const configRaw = runCast([
      "call", oracleAdapter,
      "getAssetConfig(bytes32)((address,uint8,uint256,uint256,uint8,bool))",
      candidate.assetId,
      "--rpc-url", rpcUrl,
    ]).trim();
    const cfg = parseAssetConfig(configRaw);
    const newPriceNormalized = normalizePrice(candidate.rawPrice, cfg.decimals);

    let existingPrice = 0n;
    try {
      const priceRaw = runCast([
        "call", oracleAdapter,
        "getPrice(bytes32)(uint256,uint256)",
        candidate.assetId,
        "--rpc-url", rpcUrl,
      ]).trim();
      existingPrice = parsePriceTuple(priceRaw).price;
    } catch {
      // No existing price for this asset yet.
    }

    const classification = classifyPriceCandidate(existingPrice, newPriceNormalized, cfg.deviationBps);
    if (classification.status === "override-required") {
      console.warn(
        `  OVERRIDE ${candidate.symbol}: deviation=${classification.deviationBps}bps max=${cfg.deviationBps}bps `
        + `old=${existingPrice} new=${newPriceNormalized}`,
      );
      overrideRequired.push({
        ...candidate,
        cfg,
        existingPrice,
        newPriceNormalized,
        deviationBps: classification.deviationBps,
      });
      continue;
    }

    console.log(
      `  OK       ${candidate.symbol}: deviation=${classification.deviationBps}bps max=${cfg.deviationBps}bps`,
    );
    keepersAssetIds.push(candidate.assetId);
    keepersRawPrices.push(candidate.rawPrice.toString());
  }

  console.log("");
  console.log(`OracleAdapter: ${oracleAdapter}`);
  console.log(`PriceSync:     ${priceSync}`);
  console.log(`preflight:     ${candidates.length} candidate(s)`);
  console.log(`overrides:     ${overrideRequired.length} required`);
  console.log(`submitPrices:  ${keepersAssetIds.length} asset(s)`);

  if (dryRun) {
    for (const ov of overrideRequired) {
      console.log(
        `DRY_RUN override ${ov.symbol}: old=${ov.existingPrice} new=${ov.newPriceNormalized} deviation=${ov.deviationBps}bps`,
      );
    }
    console.log("\nDRY_RUN enabled: skipping transactions.");
    console.log("\nSummary:");
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log("\nExecuting transactions via cast...");
  let wroteOnChain = false;

  for (const ov of overrideRequired) {
    try {
      const nowTs = Math.floor(Date.now() / 1000);
      const out = runCast(
        [
          "send", oracleAdapter,
          "seedHistoricalPrices(bytes32,uint256[],uint256[])",
          ov.assetId,
          `[${ov.rawPrice.toString()}]`,
          `[${nowTs}]`,
          "--private-key", adminPrivateKey,
          "--rpc-url", rpcUrl,
        ],
        { echo: true },
      );
      const txHashMatch = out.match(/0x[a-fA-F0-9]{64}/);
      const txHash = txHashMatch ? txHashMatch[0] : "unknown";
      console.log(
        `  OVERRIDE OK ${ov.symbol}: old=${ov.existingPrice} new=${ov.newPriceNormalized} `
        + `deviation=${ov.deviationBps}bps tx=${txHash}`,
      );
      summary.overriddenSuccess += 1;
      wroteOnChain = true;
    } catch (err) {
      console.warn(
        `  OVERRIDE FAIL ${ov.symbol}: old=${ov.existingPrice} new=${ov.newPriceNormalized} `
        + `deviation=${ov.deviationBps}bps error=${err.message}`,
      );
      summary.overriddenFailed += 1;
      summary.skipped += 1;
    }
  }

  if (keepersAssetIds.length > 0) {
    const assetIdArg = `[${keepersAssetIds.join(",")}]`;
    const pricesArg = `[${keepersRawPrices.join(",")}]`;
    runCast(
      [
        "send", oracleAdapter,
        "submitPrices(bytes32[],uint256[])",
        assetIdArg, pricesArg,
        "--private-key", privateKey,
        "--rpc-url", rpcUrl,
      ],
      { echo: true },
    );
    summary.keeperSubmitted = keepersAssetIds.length;
    wroteOnChain = true;
  } else {
    console.log("No keeper batch to submit after preflight.");
  }

  if (wroteOnChain) {
    runCast(
      [
        "send", priceSync,
        "syncAll()",
        "--private-key", privateKey,
        "--rpc-url", rpcUrl,
      ],
      { echo: true },
    );
  } else {
    throw new Error("No successful on-chain writes (no keeper submit and no successful override)");
  }

  console.log("\nSummary:");
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    const msg = error?.message || String(error);
    console.error(_redactSecrets(msg));
    process.exit(1);
  });
}

module.exports = {
  __testing: {
    normalizePrice,
    computeDeviationBps,
    parseAssetConfig,
    parsePriceTuple,
    classifyPriceCandidate,
  },
};
