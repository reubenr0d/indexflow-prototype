import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

type WindowKey = "24H" | "7D" | "30D";

const WINDOW_CONFIG: Record<
  WindowKey,
  { ms: number; interval: "5m" | "15m" | "1h" | "1d" }
> = {
  "24H": { ms: 24 * 60 * 60 * 1000, interval: "5m" },
  "7D": { ms: 7 * 24 * 60 * 60 * 1000, interval: "1h" },
  "30D": { ms: 30 * 24 * 60 * 60 * 1000, interval: "1d" },
};

const fxCache = new Map<string, { rate: number; ts: number }>();
const FX_TTL_MS = 60_000;

const RESPONSE_TTL_MS = 60_000;
const responseCache = new Map<
  string,
  { ts: number; payload: HistoryResponse }
>();

interface HistoryPoint {
  timestamp: number;
  priceUsd: number;
}

interface HistoryResponse {
  symbol: string;
  resolvedSymbol: string | null;
  window: WindowKey;
  interval: string;
  currency: string;
  fxRate: number;
  points: HistoryPoint[];
}

function isWindowKey(value: string | null): value is WindowKey {
  return value === "24H" || value === "7D" || value === "30D";
}

async function getUsdRate(currency: string): Promise<number | null> {
  if (currency === "USD") return 1;
  const baseCurrency = currency === "GBp" ? "GBP" : currency;
  const cached = fxCache.get(baseCurrency);
  if (cached && Date.now() - cached.ts < FX_TTL_MS) {
    return currency === "GBp" ? cached.rate / 100 : cached.rate;
  }
  try {
    const pair = `${baseCurrency}USD=X`;
    const q = await yf.quote(pair);
    const rate = q.regularMarketPrice;
    if (!rate || rate <= 0) return null;
    fxCache.set(baseCurrency, { rate, ts: Date.now() });
    return currency === "GBp" ? rate / 100 : rate;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol")?.trim();
  const windowParam = request.nextUrl.searchParams.get("window");
  if (!symbol) {
    return NextResponse.json({ error: "missing symbol" }, { status: 400 });
  }
  if (!isWindowKey(windowParam)) {
    return NextResponse.json(
      { error: "window must be one of 24H, 7D, 30D" },
      { status: 400 }
    );
  }

  const cacheKey = `${symbol.toUpperCase()}|${windowParam}`;
  const cached = responseCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < RESPONSE_TTL_MS) {
    return NextResponse.json(cached.payload, {
      headers: { "x-yfinance-cache": "hit" },
    });
  }

  const cfg = WINDOW_CONFIG[windowParam];
  const period2 = new Date();
  const period1 = new Date(period2.getTime() - cfg.ms);

  try {
    const rows = await yf.chart(symbol, {
      period1,
      period2,
      interval: cfg.interval,
    });

    const quotes = rows?.quotes ?? [];
    const meta = (rows?.meta ?? {}) as Record<string, unknown>;
    let currency = (meta.currency as string | undefined) ?? "USD";

    if (!currency || currency === "USD") {
      try {
        const q = await yf.quote(symbol);
        currency = q.currency ?? currency ?? "USD";
      } catch {
        currency = currency ?? "USD";
      }
    }

    const fxRate = (await getUsdRate(currency)) ?? 1;

    const points: HistoryPoint[] = [];
    for (const row of quotes) {
      const close = row.close ?? row.adjclose;
      if (close == null || close <= 0) continue;
      const date = row.date;
      if (!date) continue;
      const ts = Math.floor(new Date(date).getTime() / 1000);
      if (!Number.isFinite(ts) || ts <= 0) continue;
      points.push({ timestamp: ts, priceUsd: close * fxRate });
    }

    points.sort((a, b) => a.timestamp - b.timestamp);

    const payload: HistoryResponse = {
      symbol,
      resolvedSymbol: (meta.symbol as string | undefined) ?? symbol,
      window: windowParam,
      interval: cfg.interval,
      currency,
      fxRate,
      points,
    };

    responseCache.set(cacheKey, { ts: Date.now(), payload });

    return NextResponse.json(payload, {
      headers: { "x-yfinance-cache": "miss" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "history failed";
    return NextResponse.json({ error: message, symbol, window: windowParam }, { status: 502 });
  }
}
