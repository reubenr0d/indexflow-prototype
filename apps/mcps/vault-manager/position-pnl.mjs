// Pure per-position unrealised PnL helpers, factored out of index.js so the
// math is unit-testable without spawning the MCP. The MCP server imports
// `computePositionPnl` and uses it both inside `list_open_positions` (the
// per-leg fields) and inside the `open_position` INSUFFICIENT_COLLATERAL
// pre-flight (the embedded roster the LLM keys off to pick which leg to
// close).
//
// Scaling reference (matches VaultAccounting + OracleAdapter on-chain):
//   - size:           GMX 1e30 USD (size_usd * 1e30)
//   - averagePrice:   oracle 1e8 USD (price_usd * 1e8)
//   - currentPrice:   oracle 1e8 USD
//   - collateral:     GMX 1e30 USD (used internally; not consumed here)
//   - collateralUsdc: USDC 6-dec (USD * 1e6) — what we divide PnL by for %
//
// Derivation:
//   quantity_e22 = size_e30 / avgPrice_e8                                   (1)
//   pnl_e30      = quantity_e22 * priceDelta_e8                             (2)
//                = size_e30 * priceDelta_e8 / avgPrice_e8
//                = size_e30 * (priceDelta / avgPrice)
//   pnl_usdc     = pnl_e30 / 1e24                                           (3)
//
// All math is BigInt to avoid Number-precision drift on $1B+ vaults.

// Defaults match the mining-manager.md TP/SL band `[-6%, +8%]` of collateral.
// Operators can override via env on the MCP server: MCP_PNL_BAND_TP_PCT /
// MCP_PNL_BAND_SL_PCT (the index.js wrapper reads those and forwards here).
export const PNL_BAND_DEFAULTS = Object.freeze({
  takeProfitPct: 0.08,
  stopLossPct: 0.06,
});

const ONE_E24 = 10n ** 24n;

function toBigIntOrNull(value) {
  if (value === null || value === undefined) return null;
  try {
    return BigInt(String(value));
  } catch {
    return null;
  }
}

// Compute per-leg unrealised PnL fields for a single position.
//
// Inputs (all strings or bigints accepted; null/undefined returns nulls):
//   - isLong:           boolean
//   - size:             GMX 1e30 string/bigint
//   - averagePrice:     oracle 1e8 string/bigint
//   - currentOraclePrice: oracle 1e8 string/bigint
//   - collateralUsdc:   USDC 6-dec string/bigint
//   - takeProfitPct:    Number (e.g. 0.08); defaults to PNL_BAND_DEFAULTS
//   - stopLossPct:      Number (e.g. 0.06); defaults to PNL_BAND_DEFAULTS
//
// Returns:
//   {
//     unrealisedPnlUsdc:            string | null (signed, USDC 6-dec)
//     unrealisedPnlUsdc_usdc:       string | null (formatted "+1.23" / "-4.56")
//     unrealisedPnlPctOfCollateral: number | null (e.g. -0.018 = -1.8%)
//     pnlBandOutcome:               "within" | "above_take_profit" | "below_stop_loss" | "unknown"
//   }
export function computePositionPnl({
  isLong,
  size,
  averagePrice,
  currentOraclePrice,
  collateralUsdc,
  takeProfitPct,
  stopLossPct,
} = {}) {
  const tp = Number.isFinite(takeProfitPct) ? takeProfitPct : PNL_BAND_DEFAULTS.takeProfitPct;
  const sl = Number.isFinite(stopLossPct) ? stopLossPct : PNL_BAND_DEFAULTS.stopLossPct;

  const sizeBn = toBigIntOrNull(size);
  const avgBn = toBigIntOrNull(averagePrice);
  const curBn = toBigIntOrNull(currentOraclePrice);
  const collateralUsdcBn = toBigIntOrNull(collateralUsdc);

  // Without any of these we can't compute PnL — emit `unknown` so callers can
  // still attach the placeholder fields without misleading "within band".
  if (
    sizeBn === null ||
    avgBn === null ||
    curBn === null ||
    sizeBn <= 0n ||
    avgBn <= 0n
  ) {
    return {
      unrealisedPnlUsdc: null,
      unrealisedPnlUsdc_usdc: null,
      unrealisedPnlPctOfCollateral: null,
      pnlBandOutcome: "unknown",
    };
  }

  const priceDeltaBn = isLong ? curBn - avgBn : avgBn - curBn;
  // pnl_e30 = size_e30 * priceDelta_e8 / avgPrice_e8
  const pnlE30 = (sizeBn * priceDeltaBn) / avgBn;
  // pnl_usdc = pnl_e30 / 1e24 (BigInt division truncates toward zero, which
  // matches the on-chain accounting semantics for display purposes).
  const pnlUsdc = pnlE30 / ONE_E24;

  let pnlPctOfCollateral = null;
  if (collateralUsdcBn !== null && collateralUsdcBn > 0n) {
    pnlPctOfCollateral = Number(pnlUsdc) / Number(collateralUsdcBn);
  }

  let pnlBandOutcome = "unknown";
  if (pnlPctOfCollateral !== null && Number.isFinite(pnlPctOfCollateral)) {
    if (pnlPctOfCollateral >= tp) pnlBandOutcome = "above_take_profit";
    else if (pnlPctOfCollateral <= -sl) pnlBandOutcome = "below_stop_loss";
    else pnlBandOutcome = "within";
  }

  return {
    unrealisedPnlUsdc: pnlUsdc.toString(),
    unrealisedPnlUsdc_usdc: formatSignedUsdc(pnlUsdc),
    unrealisedPnlPctOfCollateral: pnlPctOfCollateral,
    pnlBandOutcome,
  };
}

function formatSignedUsdc(value) {
  const big = typeof value === "bigint" ? value : BigInt(String(value));
  const n = Number(big) / 1e6;
  const abs = Math.abs(n).toFixed(2);
  if (big > 0n) return `+${abs}`;
  if (big < 0n) return `-${abs}`;
  return abs;
}
