// Trailing price returns for trade-timing / priced-in checks.
// Shared by yfinance-mcp and atlas-quality timing layer.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

let _yf = null;
async function getYfClient() {
  if (!_yf) {
    const mod = await import("yahoo-finance2");
    const YahooFinance = mod.default;
    _yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  }
  return _yf;
}

function parseChartDate(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return NaN;
}

function pickClose(bar) {
  const close = bar?.close ?? bar?.adjclose ?? bar?.adjClose;
  return Number.isFinite(close) ? close : null;
}

function trailingReturn(closes, tradingDaysBack) {
  if (!Array.isArray(closes) || closes.length < 2) return null;
  const end = closes[closes.length - 1];
  const startIdx = Math.max(0, closes.length - 1 - tradingDaysBack);
  const start = closes[startIdx];
  if (!Number.isFinite(start) || start <= 0 || !Number.isFinite(end)) return null;
  return ((end - start) / start) * 100;
}

function largest1dMoveInWindow(bars, windowTradingDays = 30) {
  if (!Array.isArray(bars) || bars.length < 2) {
    return { maxMovePct: null, maxMoveDate: null };
  }
  const slice = bars.slice(-Math.min(bars.length, windowTradingDays + 1));
  let maxMovePct = null;
  let maxMoveDate = null;
  for (let i = 1; i < slice.length; i++) {
    const prev = pickClose(slice[i - 1]);
    const cur = pickClose(slice[i]);
    if (!Number.isFinite(prev) || !Number.isFinite(cur) || prev <= 0) continue;
    const movePct = Math.abs(((cur - prev) / prev) * 100);
    if (maxMovePct === null || movePct > maxMovePct) {
      maxMovePct = movePct;
      const ts = parseChartDate(slice[i].date);
      maxMoveDate = Number.isFinite(ts) ? new Date(ts).toISOString().slice(0, 10) : null;
    }
  }
  return { maxMovePct, maxMoveDate };
}

/**
 * @param {string} symbol Yahoo symbol
 * @param {{ yfClient?: object, periodDays?: number }} [opts]
 */
export async function fetchPriceHistory(symbol, { yfClient, periodDays = 120 } = {}) {
  const sym = String(symbol || "").trim();
  if (!sym) {
    return {
      symbol: sym,
      ok: false,
      error: "missing_symbol",
      return5dPct: null,
      return20dPct: null,
      return60dPct: null,
      max1dMove30dPct: null,
      max1dMoveDate: null,
    };
  }

  try {
    const client = yfClient || (await getYfClient());
    const period2 = new Date();
    const period1 = new Date(Date.now() - periodDays * MS_PER_DAY);
    const chart = await client.chart(sym, {
      period1,
      period2,
      interval: "1d",
    });
    const quotes = chart?.quotes || chart?.indicators?.quote?.[0] || [];
    const bars = Array.isArray(quotes) ? quotes : [];
    const closes = bars.map(pickClose).filter((c) => Number.isFinite(c));
    if (closes.length < 2) {
      return {
        symbol: sym,
        ok: false,
        error: "insufficient_history",
        return5dPct: null,
        return20dPct: null,
        return60dPct: null,
        max1dMove30dPct: null,
        max1dMoveDate: null,
      };
    }
    const { maxMovePct, maxMoveDate } = largest1dMoveInWindow(bars, 30);
    return {
      symbol: sym,
      ok: true,
      error: null,
      asOfDate: new Date().toISOString().slice(0, 10),
      return5dPct: trailingReturn(closes, 5),
      return20dPct: trailingReturn(closes, 20),
      return60dPct: trailingReturn(closes, 60),
      max1dMove30dPct: maxMovePct,
      max1dMoveDate: maxMoveDate,
      barCount: closes.length,
    };
  } catch (err) {
    return {
      symbol: sym,
      ok: false,
      error: err?.message || "chart_fetch_failed",
      return5dPct: null,
      return20dPct: null,
      return60dPct: null,
      max1dMove30dPct: null,
      max1dMoveDate: null,
    };
  }
}
