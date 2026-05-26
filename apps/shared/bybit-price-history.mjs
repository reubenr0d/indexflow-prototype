/**
 * Trailing price stats from Bybit V5 klines (crypto vol / priced-in checks).
 */

import { bybitPublicFetch } from "./bybit-public-market.mjs";

const MS_PER_HOUR = 60 * 60 * 1000;
const MAX_KLINE_LIMIT = 200;

function pickInterval(lookbackHours) {
  if (lookbackHours <= 48) return "60";
  if (lookbackHours <= 24 * 14) return "240";
  return "D";
}

function parseCandles(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => ({
      startMs: Number(r[0]),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
    }))
    .filter((c) => Number.isFinite(c.close) && c.close > 0)
    .sort((a, b) => a.startMs - b.startMs);
}

function trailingReturnBps(closes, periodsBack) {
  if (!closes.length) return null;
  const end = closes[closes.length - 1];
  const startIdx = Math.max(0, closes.length - 1 - periodsBack);
  const start = closes[startIdx];
  if (!Number.isFinite(start) || start <= 0) return null;
  return Math.round(((end - start) / start) * 10_000);
}

function maxPeriodMoveBps(candles) {
  if (candles.length < 2) return { maxMoveBps: null, maxMoveStartMs: null };
  let maxMoveBps = null;
  let maxMoveStartMs = null;
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1].close;
    const cur = candles[i].close;
    if (!Number.isFinite(prev) || prev <= 0) continue;
    const moveBps = Math.round((Math.abs(cur - prev) / prev) * 10_000);
    if (maxMoveBps === null || moveBps > maxMoveBps) {
      maxMoveBps = moveBps;
      maxMoveStartMs = candles[i].startMs;
    }
  }
  return { maxMoveBps, maxMoveStartMs };
}

function stdevBps(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * @param {string} bybitSymbol e.g. BTCUSDT
 * @param {{ lookbackHours?: number }} [opts]
 */
/**
 * Kline closes as chart points (USD) for UI / API routes.
 * @param {string} bybitSymbol e.g. BTCUSDT
 * @param {{ lookbackHours?: number }} [opts]
 */
export async function fetchBybitKlineChartPoints(bybitSymbol, { lookbackHours = 168 } = {}) {
  const sym = String(bybitSymbol ?? "").trim().toUpperCase();
  if (!sym) {
    return { bybitSymbol: sym, ok: false, error: "missing_symbol", points: [] };
  }

  const interval = pickInterval(lookbackHours);
  const endMs = Date.now();
  const startMs = endMs - lookbackHours * MS_PER_HOUR;

  try {
    const { body } = await bybitPublicFetch("/v5/market/kline", {
      category: "linear",
      symbol: sym,
      interval,
      start: String(startMs),
      end: String(endMs),
      limit: String(MAX_KLINE_LIMIT),
    });
    const candles = parseCandles(body?.result?.list);
    if (candles.length < 1) {
      return {
        bybitSymbol: sym,
        ok: false,
        error: "insufficient_history",
        interval,
        points: [],
        barCount: 0,
      };
    }
    const points = candles.map((c) => ({
      timestamp: Math.floor(c.startMs / 1000),
      priceUsd: c.close,
    }));
    return {
      bybitSymbol: sym,
      ok: true,
      error: null,
      interval,
      points,
      barCount: points.length,
    };
  } catch (err) {
    return {
      bybitSymbol: sym,
      ok: false,
      error: err?.message || "kline_fetch_failed",
      points: [],
      barCount: 0,
    };
  }
}

export async function fetchBybitPriceHistory(bybitSymbol, { lookbackHours = 168 } = {}) {
  const sym = String(bybitSymbol ?? "").trim().toUpperCase();
  if (!sym) {
    return {
      bybitSymbol: sym,
      ok: false,
      error: "missing_symbol",
      lookbackHours,
      returnBps: null,
      sevenDayVolBps: null,
      maxPeriodMoveBps: null,
      barCount: 0,
    };
  }

  const interval = pickInterval(lookbackHours);
  const endMs = Date.now();
  const startMs = endMs - lookbackHours * MS_PER_HOUR;

  try {
    const { body } = await bybitPublicFetch("/v5/market/kline", {
      category: "linear",
      symbol: sym,
      interval,
      start: String(startMs),
      end: String(endMs),
      limit: String(MAX_KLINE_LIMIT),
    });
    const candles = parseCandles(body?.result?.list);
    if (candles.length < 2) {
      return {
        bybitSymbol: sym,
        ok: false,
        error: "insufficient_history",
        lookbackHours,
        interval,
        returnBps: null,
        sevenDayVolBps: null,
        maxPeriodMoveBps: null,
        barCount: candles.length,
      };
    }

    const closes = candles.map((c) => c.close);
    const periodReturnsBps = [];
    for (let i = 1; i < closes.length; i++) {
      const prev = closes[i - 1];
      const cur = closes[i];
      if (prev > 0) periodReturnsBps.push(((cur - prev) / prev) * 10_000);
    }
    const { maxMoveBps } = maxPeriodMoveBps(candles);

    return {
      bybitSymbol: sym,
      ok: true,
      error: null,
      lookbackHours,
      interval,
      returnBps: trailingReturnBps(closes, closes.length - 1),
      sevenDayVolBps: Math.round(stdevBps(periodReturnsBps)),
      maxPeriodMoveBps: maxMoveBps,
      barCount: candles.length,
      venue: body?.result?.category ?? "linear",
    };
  } catch (err) {
    return {
      bybitSymbol: sym,
      ok: false,
      error: err?.message || "kline_fetch_failed",
      lookbackHours,
      returnBps: null,
      sevenDayVolBps: null,
      maxPeriodMoveBps: null,
      barCount: 0,
    };
  }
}
