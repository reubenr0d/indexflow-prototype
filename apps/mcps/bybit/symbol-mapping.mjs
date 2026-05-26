// Symbol normalisation for Bybit V5 linear perps.
//
// Agents speak the IndexFlow oracle symbol shape (`BTC-USD`, `ETH-USD`,
// `SOL-USD`, ...). Bybit's V5 REST API speaks the no-separator perp shape
// (`BTCUSDT`, `ETHUSDT`, ...). The mapping is deliberately strict: anything
// that isn't a recognised `<BASE>-USD` pair returns `null` so the caller
// surfaces a descriptive error instead of silently hitting a non-existent
// Bybit market.
//
// USDT is the quote on Bybit's most-liquid perp tier; USDC perps exist but
// have far thinner OI and funding noise that would make the funding-arb
// signal unreliable. We pin to USDT.

const KNOWN_BASES = new Set([
  "BTC",
  "ETH",
  "SOL",
  "AVAX",
  "LINK",
  "DOGE",
  "MATIC",
  "ARB",
  "OP",
  "ATOM",
  "SUI",
  "APT",
  "TIA",
  "INJ",
  "SEI",
  "BNB",
  "XRP",
  "LTC",
  "TRX",
  "ADA",
  "DOT",
  "NEAR",
  "FIL",
  "AAVE",
  "UNI",
  "MKR",
  "LDO",
  "RNDR",
  "FET",
]);

export function normaliseAgentSymbolToBybit(agentSymbol) {
  if (typeof agentSymbol !== "string") return null;
  const trimmed = agentSymbol.trim().toUpperCase();
  if (!trimmed) return null;
  // Already a Bybit-style symbol (e.g. "BTCUSDT") — pass through after sanity.
  if (/^[A-Z0-9]{2,10}USDT$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^([A-Z0-9]{2,8})-USD$/);
  if (!match) return null;
  const base = match[1];
  if (!KNOWN_BASES.has(base)) return null;
  return `${base}USDT`;
}

export function denormaliseBybitToAgent(bybitSymbol) {
  if (typeof bybitSymbol !== "string") return null;
  const trimmed = bybitSymbol.trim().toUpperCase();
  const match = trimmed.match(/^([A-Z0-9]{2,8})USDT$/);
  if (!match) return null;
  return `${match[1]}-USD`;
}

export const KNOWN_BASES_FOR_TESTS = KNOWN_BASES;
