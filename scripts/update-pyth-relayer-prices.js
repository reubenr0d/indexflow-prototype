#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const DEFAULT_DEPLOYMENT_CONFIG = "apps/web/src/config/sepolia-deployment.json";
const DEFAULT_FEED_CONFIG = "scripts/pyth-feed-config.json";
const DEFAULT_HERMES_URL = "https://hermes.pyth.network";
const DEFAULT_RPC_URL = "sepolia";
const DEFAULT_MAX_AGE_SECONDS = 86_400;

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

function normalizeFeedId(feedId) {
  return feedId.toLowerCase().replace(/^0x/, "");
}

function toRawPrice(price, expo, decimals) {
  const shift = expo + decimals;
  if (shift >= 0) {
    return price * 10n ** BigInt(shift);
  }

  const divisor = 10n ** BigInt(-shift);
  if (price % divisor !== 0n) {
    throw new Error(`cannot convert non-divisible price=${price} expo=${expo} to ${decimals} decimals`);
  }
  return price / divisor;
}

async function fetchPythLatest(hermesUrl, feedIds) {
  const params = new URLSearchParams();
  params.set("parsed", "true");
  for (const feedId of feedIds) {
    params.append("ids[]", `0x${feedId}`);
  }

  const url = `${hermesUrl.replace(/\/$/, "")}/v2/updates/price/latest?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Hermes request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function main() {
  const deploymentConfigPath = resolvePath(process.env.DEPLOYMENT_CONFIG, DEFAULT_DEPLOYMENT_CONFIG);
  const feedConfigPath = resolvePath(process.env.PYTH_FEED_CONFIG, DEFAULT_FEED_CONFIG);
  const hermesUrl = process.env.HERMES_URL ?? DEFAULT_HERMES_URL;
  const rpcUrl = process.env.RPC_URL ?? DEFAULT_RPC_URL;
  const maxAgeSeconds = Number(process.env.MAX_AGE_SECONDS ?? DEFAULT_MAX_AGE_SECONDS);
  const dryRun = toBool(process.env.DRY_RUN);
  const privateKey = process.env.PRIVATE_KEY;

  if (!dryRun && !privateKey) {
    throw new Error("PRIVATE_KEY is required unless DRY_RUN is enabled");
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentConfigPath, "utf8"));
  const feedConfig = JSON.parse(fs.readFileSync(feedConfigPath, "utf8"));

  const oracleAdapter = deployment.oracleAdapter;
  const priceSync = deployment.priceSync;
  if (!oracleAdapter || !priceSync) {
    throw new Error("deployment config must include oracleAdapter and priceSync");
  }

  const priceDecimals = Number(feedConfig.priceDecimals ?? 8);
  const feeds = Array.isArray(feedConfig.feeds) ? feedConfig.feeds : [];
  if (feeds.length === 0) {
    throw new Error("pyth feed config has no feeds");
  }

  const normalizedFeedIds = feeds.map((feed) => normalizeFeedId(feed.pythFeedId));
  const latest = await fetchPythLatest(hermesUrl, normalizedFeedIds);
  const parsed = Array.isArray(latest?.parsed) ? latest.parsed : [];

  const parsedById = new Map(parsed.map((entry) => [normalizeFeedId(entry.id), entry]));
  const now = Math.floor(Date.now() / 1000);

  const assetIds = [];
  const rawPrices = [];

  console.log(`Deployment config: ${deploymentConfigPath}`);
  console.log(`Feed config: ${feedConfigPath}`);
  console.log(`Hermes URL: ${hermesUrl}`);
  console.log(`RPC URL: ${rpcUrl}`);
  console.log(`Max age (s): ${maxAgeSeconds}`);
  console.log("");

  for (const feed of feeds) {
    const feedId = normalizeFeedId(feed.pythFeedId);
    const parsedFeed = parsedById.get(feedId);
    if (!parsedFeed?.price) {
      throw new Error(`missing parsed price update for ${feed.asset} (${feed.displaySymbol})`);
    }

    const publishTime = Number(parsedFeed.price.publish_time);
    if (!Number.isFinite(publishTime)) {
      throw new Error(`invalid publish_time for ${feed.asset}`);
    }
    const age = now - publishTime;
    if (age > maxAgeSeconds) {
      throw new Error(
        `stale feed for ${feed.asset}: publish_time=${publishTime} age=${age}s max=${maxAgeSeconds}s`
      );
    }

    const signedPrice = BigInt(parsedFeed.price.price);
    const expo = Number(parsedFeed.price.expo);
    if (signedPrice <= 0n) {
      throw new Error(`non-positive feed price for ${feed.asset}: ${signedPrice.toString()}`);
    }
    if (!Number.isInteger(expo)) {
      throw new Error(`invalid expo for ${feed.asset}: ${parsedFeed.price.expo}`);
    }

    const rawPrice = toRawPrice(signedPrice, expo, priceDecimals);
    if (rawPrice <= 0n) {
      throw new Error(`converted raw price is non-positive for ${feed.asset}: ${rawPrice.toString()}`);
    }

    const assetId = runCast(["keccak", feed.asset]).trim();
    assetIds.push(assetId);
    rawPrices.push(rawPrice.toString());

    console.log(
      `${feed.asset.padEnd(5)} ${feed.displaySymbol.padEnd(10)} assetId=${assetId} rawPrice=${rawPrice} publishTime=${publishTime}`
    );
  }

  const assetIdArg = `[${assetIds.join(",")}]`;
  const pricesArg = `[${rawPrices.join(",")}]`;

  console.log("");
  console.log(`OracleAdapter: ${oracleAdapter}`);
  console.log(`PriceSync: ${priceSync}`);
  console.log(`submitPrices args: ${assetIdArg} ${pricesArg}`);

  if (dryRun) {
    console.log("DRY_RUN enabled: skipping transactions.");
    return;
  }

  runCast(
    [
      "send",
      oracleAdapter,
      "submitPrices(bytes32[],uint256[])",
      assetIdArg,
      pricesArg,
      "--private-key",
      privateKey,
      "--rpc-url",
      rpcUrl
    ],
    true
  );

  runCast(
    [
      "send",
      priceSync,
      "syncAll()",
      "--private-key",
      privateKey,
      "--rpc-url",
      rpcUrl
    ],
    true
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
