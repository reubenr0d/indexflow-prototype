import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const SEARCHABLE_QUOTE_TYPES = new Set([
  "EQUITY",
  "CRYPTOCURRENCY",
  "ETF",
  "MUTUALFUND",
  "INDEX",
]);

const CRYPTO_AGENT_SYMBOL_RE = /^[A-Z0-9]{2,8}-USD$/i;

function directCryptoResult(query: string) {
  const normalized = query.trim().toUpperCase();
  if (!CRYPTO_AGENT_SYMBOL_RE.test(normalized)) return null;
  return {
    symbol: normalized,
    name: `Crypto perp oracle (${normalized})`,
    exchange: "Crypto",
    sector: "",
    industry: "",
    type: "CRYPTOCURRENCY",
  };
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 1) {
    return NextResponse.json({ results: [] });
  }

  const direct = directCryptoResult(q);
  const results: Array<{
    symbol: string;
    name: string;
    exchange: string;
    sector: string;
    industry: string;
    type?: string;
  }> = direct ? [direct] : [];

  try {
    const raw = await yf.search(q, { quotesCount: 20, newsCount: 0 });
    for (const quote of raw.quotes ?? []) {
      if (!("symbol" in quote)) continue;
      const row = quote as Record<string, unknown>;
      const quoteType = String(row.quoteType ?? "").toUpperCase();
      if (!SEARCHABLE_QUOTE_TYPES.has(quoteType)) continue;
      const symbol = String(row.symbol ?? "").trim();
      if (!symbol) continue;
      if (direct && symbol.toUpperCase() === direct.symbol) continue;
      results.push({
        symbol,
        name: (row.longname ?? row.shortname ?? "") as string,
        exchange: (row.exchDisp ?? row.exchange ?? "") as string,
        sector: (row.sectorDisp ?? "") as string,
        industry: (row.industryDisp ?? "") as string,
        type: quoteType,
      });
    }

    return NextResponse.json({ results: results.slice(0, 20) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    if (direct) return NextResponse.json({ results: [direct] });
    return NextResponse.json({ results: [], error: message }, { status: 502 });
  }
}
