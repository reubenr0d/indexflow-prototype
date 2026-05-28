#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const AGENTS = [
  "mining-manager",
  "quality-matrix-manager",
  "rwa-treasurer",
  "meth-carry-manager",
  "rwa-yield-router",
  "funding-rate-harvester",
  "smart-money-mirror-manager",
];

const NETWORKS = {
  sepolia: {
    role: "hub",
    deploymentConfig: "apps/web/src/config/sepolia-deployment.json",
    rpcSecret: "SEPOLIA_RPC_URL",
  },
  "mantle-sepolia": {
    role: "spoke",
    deploymentConfig: "apps/web/src/config/mantle-sepolia-deployment.json",
    rpcSecret: "MANTLE_SEPOLIA_RPC_URL",
  },
};
const HUB_NETWORK = "sepolia";

function parseArgs(argv) {
  const out = {
    event: process.env.EVENT_NAME || "",
    agent: process.env.AGENT_INPUT || "",
    network: process.env.NETWORK_INPUT || "",
    hourUtc: Number(process.env.HOUR_UTC || new Date().getUTCHours()),
    strictEmpty: false,
    writeGithubOutput: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--strict-empty") out.strictEmpty = true;
    else if (a === "--write-github-output") out.writeGithubOutput = true;
    else if (a === "--event") out.event = argv[++i] || "";
    else if (a === "--agent") out.agent = argv[++i] || "";
    else if (a === "--network") out.network = argv[++i] || "";
    else if (a === "--hour-utc") out.hourUtc = Number(argv[++i]);
    else {
      console.error(`Unknown arg: ${a}`);
      process.exit(1);
    }
  }

  return out;
}

function resolveRequestedNetworks(input) {
  if (!input || input === "sepolia") return [HUB_NETWORK];
  if (input in NETWORKS) {
    if (NETWORKS[input].role !== "hub") {
      throw new Error(
        `Network '${input}' is configured as a spoke. Vault-agent CI is hub-only; use '${HUB_NETWORK}'.`,
      );
    }
    return [input];
  }
  throw new Error(
    `Unknown network input: ${input}. Expected one of: ${HUB_NETWORK}`,
  );
}

function statePathForAgent(agent) {
  return path.join("agents", "memory", agent, "state.json");
}

function deploymentBasenameFromState(statePath) {
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const dep = String(state.deploymentConfigPath || "").trim();
  return dep ? path.basename(dep) : "";
}

function isAgentNetworkReady(agent, network) {
  const expected = NETWORKS[network];
  if (!expected) return false;
  const statePath = statePathForAgent(agent);
  if (!fs.existsSync(statePath)) return false;

  let stateDepBase = "";
  try {
    stateDepBase = deploymentBasenameFromState(statePath);
  } catch {
    return false;
  }
  if (!stateDepBase) return false;
  return stateDepBase === path.basename(expected.deploymentConfig);
}

function buildEntry(agent, network) {
  const cfg = NETWORKS[network];
  if (!cfg) throw new Error(`Unsupported network '${network}'`);
  if (!cfg.rpcSecret) throw new Error(`Missing RPC secret mapping for ${network}`);
  return {
    agent,
    network,
    deployment_config: cfg.deploymentConfig,
    rpc_url_secret: cfg.rpcSecret,
  };
}

function main() {
  const args = parseArgs(process.argv);
  const requestedNetworks = resolveRequestedNetworks(args.network);
  const availableNetworks = [];
  const skippedNetworks = [];

  for (const n of requestedNetworks) {
    const dep = NETWORKS[n].deploymentConfig;
    if (fs.existsSync(dep)) {
      availableNetworks.push(n);
    } else {
      skippedNetworks.push({ network: n, reason: `missing deployment config: ${dep}` });
    }
  }

  console.log(`Requested networks: ${requestedNetworks.join(", ")}`);
  if (skippedNetworks.length > 0) {
    for (const s of skippedNetworks) {
      console.log(`Skipped network ${s.network}: ${s.reason}`);
    }
  }

  if (requestedNetworks.length === 1 && availableNetworks.length === 0) {
    throw new Error(
      `Missing deployment config for explicitly requested network ${requestedNetworks[0]}: ${NETWORKS[requestedNetworks[0]].deploymentConfig}`,
    );
  }

  const include = [];
  const isScheduledLike = args.event === "schedule" || !args.agent;

  if (isScheduledLike) {
    for (const n of availableNetworks) {
      for (const a of AGENTS) {
        // Scheduled/empty-payload ticks run all hub-eligible agents.
        // Bootstrap for first-time state is handled by the runner itself.
        include.push(buildEntry(a, n));
      }
    }
  } else if (args.agent === "all") {
    for (const n of availableNetworks) {
      for (const a of AGENTS) {
        include.push(buildEntry(a, n));
      }
    }
  } else {
    if (!AGENTS.includes(args.agent)) {
      throw new Error(`Unknown agent input: ${args.agent}`);
    }
    for (const n of availableNetworks) {
      include.push(buildEntry(args.agent, n));
    }
  }

  if (include.length === 0 && args.strictEmpty) {
    throw new Error(
      `No deployed agent-network pairs matched inputs: agent=${args.agent || "<empty>"}, network=${args.network || "<empty>"}`,
    );
  }

  const matrix = { include };
  const matrixJson = JSON.stringify(matrix);
  console.log(`Resolved matrix: ${matrixJson}`);

  if (args.writeGithubOutput) {
    const outFile = process.env.GITHUB_OUTPUT;
    if (!outFile) {
      throw new Error("--write-github-output provided but GITHUB_OUTPUT is unset");
    }
    fs.appendFileSync(outFile, `matrix=${matrixJson}\n`);
  }
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
