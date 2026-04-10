import crypto from "node:crypto";

const RESERVE_BREACH_COOLDOWN_MS = Number(process.env.RESERVE_BREACH_COOLDOWN_MS ?? 30 * 60_000);
const ORACLE_STALE_THRESHOLD_SECONDS = Number(process.env.ORACLE_STALE_THRESHOLD_SECONDS ?? 45 * 60);
const LARGE_PNL_THRESHOLD_USD = Number(process.env.LARGE_PNL_THRESHOLD_USD ?? 5_000);
const OI_NEAR_CAP_BPS = Number(process.env.OPEN_INTEREST_NEAR_CAP_BPS ?? 9000);

export const EVENT_TO_PREF = {
  deposit: "depositConfirmed",
  redeem: "redeemConfirmed",
  reserveBelowTarget: "reserveBelowTarget",
  basketPaused: "basketPaused",
  openInterestNearCap: "openInterestNearCap",
  oracleStale: "oracleStale",
  pnlRealized: "largeRealizedPnl",
  riskConfigChanged: "riskConfigChanged",
};

export function hashEndpoint(endpoint) {
  return crypto.createHash("sha256").update(endpoint).digest("hex");
}

export function buildEventId(event) {
  return event.txHash ? `${event.txHash}:${event.activityType}` : `${event.activityType}:${event.id}`;
}

function toNumber(value) {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function usdcFromRaw(value) {
  return toNumber(value) / 1_000_000;
}

function usdFrom1e30(value) {
  return toNumber(value) / 1e30;
}

export function deriveRealtimeSignals(payload, nowMs = Date.now()) {
  const out = [];
  const activities = Array.isArray(payload?.basketActivities) ? payload.basketActivities : [];
  const states = Array.isArray(payload?.vaultStateCurrents) ? payload.vaultStateCurrents : [];
  const oracleUpdates = Array.isArray(payload?.oraclePriceUpdates) ? payload.oraclePriceUpdates : [];

  for (const row of activities) {
    if (row.activityType === "deposit") {
      out.push({
        eventType: "deposit",
        eventId: buildEventId(row),
        wallet: row.user?.id?.toLowerCase(),
        timestampMs: Number(row.timestamp) * 1000,
        title: "Deposit confirmed",
        body: `${row.basket?.name ?? "Basket"}: ${usdcFromRaw(row.amountUsdc).toFixed(2)} USDC deposited`,
        href: row.basket?.id ? `/baskets/${row.basket.id}` : "/portfolio",
        digestEligible: true,
      });
    }

    if (row.activityType === "redeem") {
      out.push({
        eventType: "redeem",
        eventId: buildEventId(row),
        wallet: row.user?.id?.toLowerCase(),
        timestampMs: Number(row.timestamp) * 1000,
        title: "Redemption confirmed",
        body: `${row.basket?.name ?? "Basket"}: ${usdcFromRaw(row.amountUsdc).toFixed(2)} USDC redeemed`,
        href: row.basket?.id ? `/baskets/${row.basket.id}` : "/portfolio",
        digestEligible: true,
      });
    }

    if (row.activityType === "pnlRealized") {
      const pnlUsd = usdFrom1e30(row.pnl);
      if (Math.abs(pnlUsd) >= LARGE_PNL_THRESHOLD_USD) {
        out.push({
          eventType: "pnlRealized",
          eventId: buildEventId(row),
          timestampMs: Number(row.timestamp) * 1000,
          title: "Large realized PnL",
          body: `${row.basket?.name ?? "Basket"}: ${pnlUsd >= 0 ? "+" : ""}${pnlUsd.toFixed(0)} USD`,
          href: row.basket?.id ? `/admin/baskets/${row.basket.id}` : "/admin",
          digestEligible: false,
        });
      }
    }

    if (["maxOpenInterestSet", "maxPositionSizeSet", "reservePolicyUpdated", "pauseToggled"].includes(row.activityType)) {
      out.push({
        eventType: "riskConfigChanged",
        eventId: buildEventId(row),
        timestampMs: Number(row.timestamp) * 1000,
        title: "Risk controls changed",
        body: `${row.basket?.name ?? "Basket"}: ${row.activityType}`,
        href: row.basket?.id ? `/admin/baskets/${row.basket.id}` : "/admin/risk",
        digestEligible: false,
      });
    }
  }

  for (const state of states) {
    const basket = state.basket;
    if (!basket) continue;

    if (state.paused) {
      out.push({
        eventType: "basketPaused",
        eventId: `paused:${basket.id}`,
        timestampMs: nowMs,
        title: "Basket paused",
        body: `${basket.name ?? "Basket"} has paused trading-sensitive operations`,
        href: `/baskets/${basket.id}`,
        digestEligible: false,
      });
    }

    const minReserveBps = toNumber(basket.minReserveBps);
    if (minReserveBps > 0) {
      const tvl = usdcFromRaw(basket.tvlBookUsdc);
      const idle = usdcFromRaw(basket.usdcBalanceUsdc);
      const required = (tvl * minReserveBps) / 10_000;
      if (required > 0 && idle < required) {
        out.push({
          eventType: "reserveBelowTarget",
          eventId: `reserve:${basket.id}`,
          timestampMs: nowMs,
          title: "Reserve below target",
          body: `${basket.name ?? "Basket"}: idle ${idle.toFixed(2)} USDC < required ${required.toFixed(2)} USDC`,
          href: `/baskets/${basket.id}`,
          digestEligible: false,
          cooldownMs: RESERVE_BREACH_COOLDOWN_MS,
        });
      }
    }

    const deposited = usdcFromRaw(state.depositedCapital);
    const openInterest = usdFrom1e30(state.openInterest);
    if (deposited > 0) {
      const ratioBps = (openInterest / deposited) * 10_000;
      if (ratioBps >= OI_NEAR_CAP_BPS) {
        out.push({
          eventType: "openInterestNearCap",
          eventId: `oi:${basket.id}`,
          timestampMs: nowMs,
          title: "Open interest near cap",
          body: `${basket.name ?? "Basket"}: open interest ${ratioBps.toFixed(0)} bps of deposited capital`,
          href: `/admin/baskets/${basket.id}`,
          digestEligible: false,
        });
      }
    }
  }

  const latestOracleTimestamp = Number(oracleUpdates[0]?.priceTimestamp ?? 0);
  if (latestOracleTimestamp > 0) {
    const ageSeconds = Math.floor(nowMs / 1000) - latestOracleTimestamp;
    if (ageSeconds >= ORACLE_STALE_THRESHOLD_SECONDS) {
      out.push({
        eventType: "oracleStale",
        eventId: `oracle:${latestOracleTimestamp}`,
        timestampMs: nowMs,
        title: "Oracle updates stale",
        body: `No oracle update in ${Math.floor(ageSeconds / 60)} minutes`,
        href: "/admin/oracle",
        digestEligible: false,
      });
    }
  }

  return out;
}

export function buildDigestSummary(activities) {
  const grouped = new Map();
  for (const item of activities) {
    const wallet = item.user?.id?.toLowerCase();
    if (!wallet) continue;
    const row = grouped.get(wallet) ?? { deposit: 0, redeem: 0, positionOpened: 0, positionClosed: 0 };
    if (item.activityType in row) {
      row[item.activityType] += 1;
    }
    grouped.set(wallet, row);
  }

  return Array.from(grouped.entries()).map(([wallet, counts]) => {
    const parts = [];
    if (counts.deposit) parts.push(`${counts.deposit} deposits`);
    if (counts.redeem) parts.push(`${counts.redeem} redemptions`);
    if (counts.positionOpened) parts.push(`${counts.positionOpened} opens`);
    if (counts.positionClosed) parts.push(`${counts.positionClosed} closes`);

    return {
      wallet,
      title: "IndexFlow digest",
      body: parts.length ? `Recent activity: ${parts.join(", ")}` : "Recent activity summary available",
      href: "/portfolio",
    };
  });
}
