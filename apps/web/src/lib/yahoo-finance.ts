export function yahooFinanceQuoteUrl(symbol: string): string {
  return `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/`;
}
