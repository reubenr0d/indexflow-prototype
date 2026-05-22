/**
 * Shared Yahoo USD quote helper.
 *
 * Consumed by:
 * - apps/mcps/yfinance/index.js (yfinance_quote tool)
 * - apps/mcps/vault-manager/index.js (wire_asset live-price guard)
 *
 * Both need the same FX conversion semantics so an agent that reads
 * `priceUsd` from yfinance_quote and passes it to wire_asset cannot trip the
 * deviation guard purely because of FX drift between the two calls.
 */

let _yf = null;
async function getClient() {
  if (!_yf) {
    const mod = await import("yahoo-finance2");
    const YahooFinance = mod.default;
    _yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  }
  return _yf;
}

const FX_TTL_MS = 60_000;
const _fxCache = new Map();

class YahooUnavailableError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "YahooUnavailableError";
    this.code = "YAHOO_UNAVAILABLE";
    if (cause) this.cause = cause;
  }
}

async function getUsdRate(currency) {
  if (!currency || currency === "USD") return 1;
  const cached = _fxCache.get(currency);
  if (cached && Date.now() - cached.ts < FX_TTL_MS) return cached.rate;
  let q;
  try {
    const client = await getClient();
    q = await client.quote(`${currency}USD=X`);
  } catch (err) {
    throw new YahooUnavailableError(`FX lookup failed for ${currency}USD=X: ${err.message}`, err);
  }
  const rate = q?.regularMarketPrice;
  if (!rate || rate <= 0) {
    throw new YahooUnavailableError(`FX rate unavailable for ${currency}USD=X`);
  }
  _fxCache.set(currency, { rate, ts: Date.now() });
  return rate;
}

/**
 * Fetch a single Yahoo quote and convert to USD.
 * @param {string} symbol Yahoo Finance ticker (e.g. "BHP.AX", "AAPL").
 * @returns {Promise<{price:number, priceUsd:number, currency:string, marketState:string, resolvedSymbol:string|null, name:string, exchange:string, dayChange:number|null, dayChangePct:number|null, volume:number|null, marketCap:number|null}>}
 * @throws {YahooUnavailableError} when Yahoo Finance is unreachable, the symbol
 *   resolves to no price, or the FX leg fails.
 */
export async function fetchLivePriceUsd(symbol) {
  let q;
  try {
    const client = await getClient();
    q = await client.quote(symbol);
  } catch (err) {
    throw new YahooUnavailableError(`Quote failed for ${symbol}: ${err.message}`, err);
  }
  const price = q?.regularMarketPrice ?? null;
  if (price == null || price <= 0) {
    throw new YahooUnavailableError(`No regularMarketPrice for ${symbol}`);
  }
  const currency = q.currency ?? "USD";
  const fxRate = await getUsdRate(currency);
  const priceUsd = +(price * fxRate).toFixed(4);
  return {
    price,
    priceUsd,
    currency,
    marketState: q.marketState ?? "CLOSED",
    resolvedSymbol: q.symbol ?? null,
    name: q.longName ?? q.shortName ?? "",
    exchange: q.fullExchangeName ?? "",
    dayChange: q.regularMarketChange ?? null,
    dayChangePct: q.regularMarketChangePercent ?? null,
    volume: q.regularMarketVolume ?? null,
    marketCap: q.marketCap ?? null,
  };
}

export { YahooUnavailableError };

/**
 * Default deviation tolerance for `wire_asset` seed-price validation.
 * Matches `OracleAdapter.configureAsset`'s default `deviationBps` (2000 = 20%)
 * applied to subsequent `submitPrices` updates. The first submission skips
 * the on-chain deviation guard (see `_validateDeviation` in
 * `src/perp/OracleAdapter.sol`), so this is the only place a hallucinated
 * seed gets caught at write time.
 */
export const SEED_PRICE_MAX_DEVIATION_BPS = 2000;

/**
 * Pure deviation check used by the `wire_asset` MCP guard.
 *
 * Returns `{ ok: true }` when the agent-supplied `seedPriceUsd` is within
 * `maxBps / 10_000` of the live USD quote. Returns `{ ok: false, devBps }`
 * with the computed deviation otherwise.
 *
 * Defensive against zero/NaN inputs so callers don't need to pre-validate:
 *   - `livePriceUsd <= 0` or NaN -> reject (can't divide).
 *   - `seedPriceUsd <= 0` or NaN -> reject.
 *   - All other paths return a finite, non-negative `devBps`.
 *
 * @param {number} seedPriceUsd Agent-supplied USD price.
 * @param {number} livePriceUsd Live Yahoo USD price (already FX-converted).
 * @param {number} [maxBps] Tolerance in basis points (default 2000 = 20%).
 * @returns {{ok:true} | {ok:false, devBps:number, reason:string}}
 */
export function validateSeedPriceUsd(seedPriceUsd, livePriceUsd, maxBps = SEED_PRICE_MAX_DEVIATION_BPS) {
  if (!Number.isFinite(seedPriceUsd) || seedPriceUsd <= 0) {
    return { ok: false, devBps: Infinity, reason: "seedPriceUsd must be a positive finite number" };
  }
  if (!Number.isFinite(livePriceUsd) || livePriceUsd <= 0) {
    return { ok: false, devBps: Infinity, reason: "livePriceUsd must be a positive finite number" };
  }
  const devBps = Math.round((Math.abs(seedPriceUsd - livePriceUsd) / livePriceUsd) * 10_000);
  if (devBps > maxBps) {
    return { ok: false, devBps, reason: `deviation ${devBps} bps exceeds max ${maxBps} bps` };
  }
  return { ok: true, devBps };
}
