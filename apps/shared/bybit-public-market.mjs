/**
 * Shared Bybit V5 public market HTTP helpers (no auth).
 * Used by bybit-mcp and the Yahoo price keeper's crypto fallback path.
 */

const FETCH_TIMEOUT_MS = 10_000;

export function getBybitBaseUrl() {
  const raw = String(process.env.BYBIT_TESTNET ?? "0").toLowerCase();
  const isTestnet = ["1", "true", "yes"].includes(raw);
  return isTestnet ? "https://api-testnet.bybit.com" : "https://api.bybit.com";
}

export async function bybitPublicFetch(path, searchParams) {
  const base = getBybitBaseUrl();
  const qs = new URLSearchParams(searchParams).toString();
  const url = `${base}${path}?${qs}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`HTTP ${resp.status} ${resp.statusText}: ${text.slice(0, 200)}`);
    }
    const body = await resp.json();
    if (body?.retCode !== 0) {
      throw new Error(
        `Bybit retCode=${body?.retCode} retMsg=${String(body?.retMsg || "unknown")}`,
      );
    }
    return { body, url };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Latest linear-perp index price in USD for a Bybit symbol (e.g. BTCUSDT).
 * Prefers index over mark for oracle-style spot reference.
 */
export async function fetchBybitIndexPriceUsd(bybitSymbol) {
  const { body } = await bybitPublicFetch("/v5/market/tickers", {
    category: "linear",
    symbol: bybitSymbol,
  });
  const row = body?.result?.list?.[0];
  if (!row) {
    throw new Error(`Bybit returned no ticker row for ${bybitSymbol}`);
  }
  const index = Number(row.indexPrice);
  const mark = Number(row.markPrice);
  const price = Number.isFinite(index) && index > 0 ? index : mark;
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`No index/mark price for ${bybitSymbol}`);
  }
  return {
    priceUsd: price,
    indexPriceUsd: index,
    markPriceUsd: mark,
    venue: getBybitBaseUrl().includes("testnet") ? "bybit-testnet" : "bybit-mainnet",
  };
}
