// Decodes Ethereum revert payloads emitted by `cast send` / `cast call`
// stderr messages into structured MCP error responses. Pure module so it can
// be unit-tested without spawning the MCP or hitting an RPC.
//
// Background: every write tool in vault-manager invokes `cast send`. When the
// EVM reverts, foundry surfaces a string like:
//
//   Error: Failed to estimate gas: server returned an error response:
//   error code 3: execution reverted, data: "0x8a30b6461a3a155cd907..."
//
// Or for require-string reverts (Error(string)):
//
//   ... execution reverted, data: "0x08c379a0..."
//
// Without decoding, the LLM only sees `TX_REVERTED` + raw selector bytes and
// has no way to figure out it should skip a wire (already wired) or close a
// position first (insufficient capital). The 2026-05-22 mining-manager runs
// retried wire_asset(CRML) every cycle for exactly this reason.

const ERROR_STRING_SELECTOR = "0x08c379a0";
const PANIC_SELECTOR = "0x4e487b71";

// Selector → friendly metadata. Selectors are the first 4 bytes of
// keccak256("ErrorName(types,...)").
//
// Keep this hand-curated; we do not reflect against forge artifacts at MCP
// startup so this list captures the errors the agent has actually hit (or is
// likely to hit) on the perp / oracle / vault stack.
//
// Verified via `cast sig "..."`:
//   MappingAlreadyExists(bytes32)              0x8a30b646   PriceSync.sol:50
//   InsufficientCapital(address,uint256,uint256)            VaultAccounting.sol:101
//   AssetTokenNotMapped(bytes32)                            VaultAccounting.sol:103
//   PositionNotFound(bytes32)                               VaultAccounting.sol:105
//   VaultNotRegistered(address)                             VaultAccounting.sol:97
//   VaultAlreadyRegistered(address)                         VaultAccounting.sol:99
//   AssetNotFound(bytes32)                                  OracleAdapter.sol:56
//   AssetNotActive(bytes32)                                 OracleAdapter.sol:58
//   StalePrice(bytes32,uint256,uint256)                     OracleAdapter.sol:60
//   DeviationTooLarge(bytes32,uint256,uint256,uint256)      OracleAdapter.sol:62
//   InvalidPrice()                                          OracleAdapter.sol:64
//   Unauthorized()                                          OracleAdapter.sol:66
//   MappingNotFound(bytes32)                                PriceSync.sol:52
//   ZeroAddress()                                           PriceSync.sol:54
export const KNOWN_ERRORS = {
  // --- PriceSync ---
  "0x8a30b646": {
    error_code: "MAPPING_ALREADY_EXISTS",
    name: "MappingAlreadyExists",
    args: ["bytes32"],
    argNames: ["assetId"],
    source: "PriceSync",
    message: (args) =>
      `PriceSync.addMapping reverted: assetId ${args.assetId} is already mapped. ` +
      "The asset was wired in a previous run; do not re-wire.",
    recovery_hint:
      "Asset is already wired to PriceSync. Skip wire_asset for this symbol; use the existing assetId from get_oracle_assets in set_vault_assets / open_position.",
  },

  // --- VaultAccounting ---
  "0x299f3425": {
    error_code: "VAULT_NOT_REGISTERED",
    name: "VaultNotRegistered",
    args: ["address"],
    argNames: ["vault"],
    source: "VaultAccounting",
    message: (args) => `Vault ${args.vault} is not registered with VaultAccounting.`,
    recovery_hint:
      "Vault is not registered. Call create_vault (which auto-registers) or have the deployer call registerVault.",
  },
  "0x38bfcc16": {
    error_code: "VAULT_ALREADY_REGISTERED",
    name: "VaultAlreadyRegistered",
    args: ["address"],
    argNames: ["vault"],
    source: "VaultAccounting",
    message: (args) => `Vault ${args.vault} is already registered.`,
    recovery_hint: "Skip register; vault is already wired in VaultAccounting.",
  },
  "0x001356fc": {
    error_code: "INSUFFICIENT_CAPITAL",
    name: "InsufficientCapital",
    args: ["address", "uint256", "uint256"],
    argNames: ["vault", "requested", "available"],
    source: "VaultAccounting",
    message: (args) =>
      `VaultAccounting.InsufficientCapital: vault=${args.vault}, requested=${args.requested}, available=${args.available} (raw USDC, 6 decimals).`,
    recovery_hint:
      "Vault does not have enough free USDC for the requested action. Close one or more open positions (close_position) to free up collateral, or size down. Use get_vault_pnl to compare deposited capital vs collateral locked.",
  },
  "0x5bb87345": {
    error_code: "ASSET_NOT_MAPPED",
    name: "AssetTokenNotMapped",
    args: ["bytes32"],
    argNames: ["assetId"],
    source: "VaultAccounting",
    message: (args) =>
      `VaultAccounting has no GMX index token mapped for assetId ${args.assetId}.`,
    recovery_hint:
      "Asset is not mapped on VaultAccounting. Call wire_asset for this symbol first (it maps the asset across VaultAccounting / FundingRateManager / PriceSync).",
  },
  "0x426cfff0": {
    error_code: "POSITION_NOT_FOUND",
    name: "PositionNotFound",
    args: ["bytes32"],
    argNames: ["positionKey"],
    source: "VaultAccounting",
    message: (args) =>
      `No tracked position for key ${args.positionKey}.`,
    recovery_hint:
      "There's no open leg for this (vault, asset, isLong) triple. Use get_position_tracking or list_open_positions to confirm direction and existence before close_position.",
  },

  // --- OracleAdapter ---
  "0x0a2de0f3": {
    error_code: "ASSET_NOT_FOUND",
    name: "AssetNotFound",
    args: ["bytes32"],
    argNames: ["assetId"],
    source: "OracleAdapter",
    message: (args) =>
      `OracleAdapter has no record for assetId ${args.assetId}.`,
    recovery_hint:
      "Asset has never been configured. Call wire_asset to register it before set_vault_assets / open_position.",
  },
  "0xf558e2db": {
    error_code: "ASSET_NOT_ACTIVE",
    name: "AssetNotActive",
    args: ["bytes32"],
    argNames: ["assetId"],
    source: "OracleAdapter",
    message: (args) =>
      `OracleAdapter assetId ${args.assetId} is currently deactivated.`,
    recovery_hint:
      "Asset was deactivated in OracleAdapter. Skip this asset for the run; do not include it in set_vault_assets.",
  },
  "0x00bfc921": {
    error_code: "INVALID_PRICE",
    name: "InvalidPrice",
    args: [],
    argNames: [],
    source: "OracleAdapter",
    message: () => "OracleAdapter rejected price (zero / invalid).",
    recovery_hint:
      "Provide a non-zero seedPriceUsd. Re-run yfinance_quote to fetch the live USD value.",
  },
  "0x82b42900": {
    error_code: "UNAUTHORIZED",
    name: "Unauthorized",
    args: [],
    argNames: [],
    source: "OracleAdapter / VaultAccounting",
    message: () => "Caller is not owner / keeper / wirer for this contract.",
    recovery_hint:
      "Verify PRIVATE_KEY matches the configured owner / keeper / wirer for the target contract.",
  },
  "0xaffad796": {
    error_code: "STALE_PRICE",
    name: "StalePrice",
    args: ["bytes32", "uint256", "uint256"],
    argNames: ["assetId", "lastUpdate", "threshold"],
    source: "OracleAdapter",
    message: (args) =>
      `OracleAdapter price stale for ${args.assetId}: lastUpdate=${args.lastUpdate}, threshold=${args.threshold}.`,
    recovery_hint:
      "Wait for the price keeper to refresh, or skip this asset for the run.",
  },
  "0xbdecbfb7": {
    error_code: "DEVIATION_TOO_LARGE",
    name: "DeviationTooLarge",
    args: ["bytes32", "uint256", "uint256", "uint256"],
    argNames: ["assetId", "oldPrice", "newPrice", "maxDeviationBps"],
    source: "OracleAdapter",
    message: (args) =>
      `OracleAdapter deviation too large for ${args.assetId}: old=${args.oldPrice}, new=${args.newPrice}, maxBps=${args.maxDeviationBps}.`,
    recovery_hint:
      "Submitted price moved too far from the previous oracle reading; the keeper will retry next interval.",
  },

  // --- PriceSync ---
  "0x932e05cb": {
    error_code: "MAPPING_NOT_FOUND",
    name: "MappingNotFound",
    args: ["bytes32"],
    argNames: ["assetId"],
    source: "PriceSync",
    message: (args) =>
      `PriceSync has no mapping for assetId ${args.assetId}.`,
    recovery_hint:
      "Asset is not wired in PriceSync. Call wire_asset first.",
  },
  "0xd92e233d": {
    error_code: "ZERO_ADDRESS",
    name: "ZeroAddress",
    args: [],
    argNames: [],
    source: "PriceSync",
    message: () => "Zero address rejected by PriceSync.",
    recovery_hint:
      "An argument was 0x0; this is usually a deployment misconfiguration.",
  },
};

// Pull the `data: "0x..."` blob out of a `cast` stderr message (the format
// foundry emits today). Returns `null` when no payload is present, e.g. when
// the failure was network-level rather than EVM-level.
export function extractRevertData(message) {
  if (typeof message !== "string") return null;
  const m = message.match(/data:\s*"(0x[0-9a-fA-F]+)"/);
  if (!m) return null;
  const data = m[1];
  if (!/^0x[0-9a-fA-F]+$/.test(data)) return null;
  return data.toLowerCase();
}

function parseUint256(hex32) {
  return BigInt("0x" + hex32).toString();
}

function parseAddress(hex32) {
  // Address is right-aligned in a 32-byte word.
  return "0x" + hex32.slice(-40).toLowerCase();
}

function parseArg(kind, hex32) {
  if (kind === "address") return parseAddress(hex32);
  if (kind === "bytes32") return "0x" + hex32.toLowerCase();
  if (kind === "uint256" || kind === "int256") return parseUint256(hex32);
  return "0x" + hex32;
}

// Decode a hex-encoded revert payload into structured form. Returns:
//   { matched: false, selector, data }                      — unknown selector
//   { matched: true, error_code, name, args, ... }          — decoded
//   null                                                    — payload too short
//
// `data` here is the lowercase 0x-prefixed string from `extractRevertData`.
export function decodeRevertData(data) {
  if (typeof data !== "string" || !data.startsWith("0x")) return null;
  const body = data.slice(2);
  if (body.length < 8) return null;

  const selector = "0x" + body.slice(0, 8).toLowerCase();
  const argsBlob = body.slice(8);

  // Special-case Error(string) — most legacy require() reverts.
  if (selector === ERROR_STRING_SELECTOR) {
    const reason = decodeErrorString(argsBlob);
    return {
      matched: true,
      error_code: "REQUIRE_REVERT",
      name: "Error(string)",
      selector,
      reason,
      message: reason
        ? `Contract reverted with require(string): ${reason}`
        : "Contract reverted with require(string).",
      recovery_hint:
        "Read the reason text and adjust inputs accordingly. Use get_vault_state / get_position_tracking to inspect on-chain context before retrying.",
    };
  }

  // Panic(uint256) — division by zero, arithmetic overflow, etc.
  if (selector === PANIC_SELECTOR) {
    const code = argsBlob.length >= 64 ? parseUint256(argsBlob.slice(0, 64)) : "0";
    return {
      matched: true,
      error_code: "PANIC",
      name: "Panic(uint256)",
      selector,
      panicCode: code,
      message: `Contract panic, code=${code}.`,
      recovery_hint:
        "Solidity panic is almost always an unsafe arithmetic op or assertion. Re-check input units and bounds.",
    };
  }

  const known = KNOWN_ERRORS[selector];
  if (!known) {
    return {
      matched: false,
      selector,
      data,
    };
  }

  const args = {};
  for (let i = 0; i < known.args.length; i++) {
    const offset = i * 64;
    const word = argsBlob.slice(offset, offset + 64);
    if (word.length < 64) break;
    args[known.argNames[i]] = parseArg(known.args[i], word);
  }

  const message =
    typeof known.message === "function" ? known.message(args) : known.message;

  return {
    matched: true,
    error_code: known.error_code,
    name: known.name,
    source: known.source,
    selector,
    args,
    message,
    recovery_hint: known.recovery_hint,
  };
}

function decodeErrorString(argsBlob) {
  if (argsBlob.length < 128) return null;
  // Layout: offset(32) | length(32) | data
  const len = parseInt(argsBlob.slice(64, 128), 16);
  if (!Number.isFinite(len) || len <= 0) return "";
  const dataHex = argsBlob.slice(128, 128 + len * 2);
  try {
    return Buffer.from(dataHex, "hex").toString("utf8");
  } catch {
    return null;
  }
}

// Top-level helper used by writeError(): given a cast-stderr message, return
// either a decoded structured response or null when nothing matches.
export function decodeCastRevert(message) {
  const data = extractRevertData(message);
  if (!data) return null;
  return decodeRevertData(data);
}
