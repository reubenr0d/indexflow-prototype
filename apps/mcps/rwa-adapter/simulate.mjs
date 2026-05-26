// Pure-JS simulation helpers used by the rwa-adapter MCP's `simulate_*` tools.
//
// The adapter contract is the single source of on-chain truth, but the
// agent needs a cheap, deterministic dry-run before signing a write.
// Doing the math here keeps the tool fast (no extra cast calls) and lets
// us unit-test the projection logic without spawning the MCP.
//
// All bps fields use 1 bp = 1/10_000 (so 7000 bps = 70%). USDC values
// are raw 6-decimal strings to avoid float drift; the helpers convert
// to/from BigInt internally.

export const BPS_DENOMINATOR = 10_000n;

function toBigInt(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) throw new Error("non-finite value");
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string") {
    if (!/^-?\d+$/.test(value.trim())) throw new Error(`invalid bigint string: ${value}`);
    return BigInt(value.trim());
  }
  throw new Error(`unsupported value type ${typeof value}`);
}

/// Project the reserve-bps + idle-USDC state of a vault after an
/// allocate / withdraw against the RWA reserve.
///
/// Inputs (all raw USDC = 6 decimals):
///   - idleUsdc:        vault.usdc.balanceOf(vault) BEFORE the action
///   - reserveValueUsdc: adapter.getReserveValueUsdc() BEFORE the action
///   - perpEquityUsdc:  vault's perp-engine equity contribution to NAV
///   - usdcAmount:      amount being allocated (+) or withdrawn (-)
///   - pendingRedemptionsUsdc: open redemption queue at the time of action
///
/// Outputs:
///   - projectedIdleUsdc, projectedReserveUsdc, projectedTotalUsdc
///   - projectedReserveBps (reserve / total)
///   - redemptionMarginAfter (idle-after - pendingRedemptions*1.10)
///
/// `kind` is "allocate" or "withdraw"; the sign convention is folded in
/// so the caller passes positive amounts in both directions.
export function projectReserveStateAfter({
  kind,
  idleUsdc,
  reserveValueUsdc,
  perpEquityUsdc,
  usdcAmount,
  pendingRedemptionsUsdc = 0n,
}) {
  const idle = toBigInt(idleUsdc);
  const reserve = toBigInt(reserveValueUsdc);
  const perp = toBigInt(perpEquityUsdc);
  const amount = toBigInt(usdcAmount);
  const pending = toBigInt(pendingRedemptionsUsdc);

  if (amount < 0n) throw new Error("usdcAmount must be non-negative");
  let projectedIdle;
  let projectedReserve;
  if (kind === "allocate") {
    if (amount > idle) throw new Error("allocate: amount exceeds idle USDC");
    projectedIdle = idle - amount;
    projectedReserve = reserve + amount;
  } else if (kind === "withdraw") {
    if (amount > reserve) throw new Error("withdraw: amount exceeds reserve");
    projectedIdle = idle + amount;
    projectedReserve = reserve - amount;
  } else {
    throw new Error(`unsupported kind: ${kind}`);
  }
  const projectedTotal = projectedIdle + projectedReserve + perp;
  const projectedReserveBps =
    projectedTotal === 0n ? 0n : (projectedReserve * BPS_DENOMINATOR) / projectedTotal;
  // Margin = idle-after - pending*1.10. 110% = pending * 110 / 100.
  const requiredMargin = (pending * 110n) / 100n;
  const redemptionMarginAfter = projectedIdle - requiredMargin;
  return {
    projectedIdleUsdc: projectedIdle.toString(),
    projectedReserveUsdc: projectedReserve.toString(),
    projectedTotalUsdc: projectedTotal.toString(),
    projectedReserveBps: Number(projectedReserveBps),
    redemptionMarginAfterUsdc: redemptionMarginAfter.toString(),
    redemptionMarginAfterIsPositive: redemptionMarginAfter >= 0n,
  };
}

/// Project the post-rotation reserve state when switching reserve tokens.
/// The rotation is NAV-neutral except for round-trip slippage measured in
/// bps. `slippageBps` is the projected loss in bps of the full freed USDC.
export function projectRotationAfter({
  reserveValueUsdc,
  perpEquityUsdc,
  idleUsdc,
  slippageBps,
  pendingRedemptionsUsdc = 0n,
}) {
  const reserve = toBigInt(reserveValueUsdc);
  const perp = toBigInt(perpEquityUsdc);
  const idle = toBigInt(idleUsdc);
  const pending = toBigInt(pendingRedemptionsUsdc);
  const slippage = toBigInt(slippageBps);
  if (slippage < 0n) throw new Error("slippageBps must be non-negative");

  const slippageUsdc = (reserve * slippage) / BPS_DENOMINATOR;
  const projectedReserve = reserve - slippageUsdc;
  const projectedTotal = idle + projectedReserve + perp;
  const projectedReserveBps =
    projectedTotal === 0n ? 0n : (projectedReserve * BPS_DENOMINATOR) / projectedTotal;
  const requiredMargin = (pending * 110n) / 100n;
  const redemptionMarginAfter = idle - requiredMargin;
  return {
    slippageUsdcCost: slippageUsdc.toString(),
    projectedReserveUsdc: projectedReserve.toString(),
    projectedTotalUsdc: projectedTotal.toString(),
    projectedReserveBps: Number(projectedReserveBps),
    redemptionMarginAfterUsdc: redemptionMarginAfter.toString(),
    redemptionMarginAfterIsPositive: redemptionMarginAfter >= 0n,
  };
}

export const RESERVE_TOKEN_ENUM = ["USDY", "MUSD", "METH"];

export function reserveTokenIndexOf(name) {
  const idx = RESERVE_TOKEN_ENUM.indexOf(String(name || "").toUpperCase());
  if (idx < 0) {
    throw new Error(`unknown reserve token "${name}"; supported: ${RESERVE_TOKEN_ENUM.join(", ")}`);
  }
  return idx;
}

export function reserveTokenNameOf(index) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= RESERVE_TOKEN_ENUM.length) {
    throw new Error(`reserve token index out of range: ${index}`);
  }
  return RESERVE_TOKEN_ENUM[i];
}
