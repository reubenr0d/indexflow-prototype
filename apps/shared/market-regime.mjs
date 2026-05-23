// Pure market-regime classifier shared by `get_market_regime` (yfinance MCP)
// and the agent runner's short-side gate. The MCP fetches the underlying
// quotes; this module just turns the day-change numbers into a regime tag
// and short/long bonuses. Keeping the math pure means it's testable without
// the network and re-usable from any process that already has the day-change
// numbers (e.g. the future risk-officer pass).

// Yahoo Finance tickers for the five regime components.
//   GC=F     — Gold futures
//   HG=F     — Copper futures
//   XME      — SPDR S&P Metals & Mining ETF (US mining basket)
//   GDX      — VanEck Gold Miners ETF
//   DX-Y.NYB — US Dollar Index
export const REGIME_COMPONENT_SYMBOLS = ["GC=F", "HG=F", "XME", "GDX", "DX-Y.NYB"];

// Day-change thresholds (percent) for the short-side penalty. Mining stocks
// are squeeze-prone: a miners ETF up >=3% on the day means an existing
// short can bleed 30%+ of collateral in a single tick, so the runner blocks
// all new shorts in that regime.
export const SHORT_PENALTY_HIGH_PCT = 3;
export const SHORT_PENALTY_LOW_PCT = 1;

// Numeric "agree with miners" classification. Returns:
//   +1  — bullish for miners (metals/miners up, USD down)
//   -1  — bearish for miners
//    0  — neutral / unavailable
function _bullishVote(symbol, dayChangePct) {
  if (!Number.isFinite(dayChangePct)) return 0;
  if (symbol === "DX-Y.NYB") {
    // USD strength is INVERSELY correlated with metals/miners.
    if (dayChangePct < 0) return 1;
    if (dayChangePct > 0) return -1;
    return 0;
  }
  if (dayChangePct > 0) return 1;
  if (dayChangePct < 0) return -1;
  return 0;
}

// Pure scorer. Input is `{ symbol: dayChangePct }` (use Number, not string;
// undefined / null / NaN are treated as "unavailable" and the corresponding
// component is reported with `vote: 0` instead of failing the whole call).
//
// Returns:
//   {
//     regime: "metals_risk_on" | "metals_risk_off" | "metals_neutral",
//     components: { [symbol]: { dayChangePct, vote, status } },
//     bullishCount, bearishCount, neutralCount,
//     shortPenalty: 0 | 1 | 2,
//     longBonus:    0 | 1 | 2,
//     summary: string,
//   }
export function classifyMarketRegime(componentDayChanges = {}) {
  const components = {};
  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;
  for (const symbol of REGIME_COMPONENT_SYMBOLS) {
    const raw = componentDayChanges[symbol];
    const dayChangePct = Number.isFinite(raw) ? Number(raw) : null;
    if (dayChangePct == null) {
      components[symbol] = { dayChangePct: null, vote: 0, status: "unavailable" };
      neutralCount += 1;
      continue;
    }
    const vote = _bullishVote(symbol, dayChangePct);
    components[symbol] = {
      dayChangePct,
      vote,
      status: vote === 1 ? "bullish-miners" : vote === -1 ? "bearish-miners" : "neutral",
    };
    if (vote === 1) bullishCount += 1;
    else if (vote === -1) bearishCount += 1;
    else neutralCount += 1;
  }

  let regime = "metals_neutral";
  if (bullishCount >= 3) regime = "metals_risk_on";
  else if (bearishCount >= 3) regime = "metals_risk_off";

  // Short penalty looks specifically at the mining ETFs (XME / GDX): a sharp
  // up-day on either is enough to squeeze shorts even when the underlying
  // commodity is mixed.
  const xme = components["XME"]?.dayChangePct;
  const gdx = components["GDX"]?.dayChangePct;
  const minerMax = Math.max(
    Number.isFinite(xme) ? xme : -Infinity,
    Number.isFinite(gdx) ? gdx : -Infinity,
  );
  const minerMin = Math.min(
    Number.isFinite(xme) ? xme : Infinity,
    Number.isFinite(gdx) ? gdx : Infinity,
  );

  let shortPenalty = 0;
  if (Number.isFinite(minerMax)) {
    if (minerMax >= SHORT_PENALTY_HIGH_PCT) shortPenalty = 2;
    else if (minerMax >= SHORT_PENALTY_LOW_PCT) shortPenalty = 1;
  }

  // Long bonus mirrors short penalty but on the downside — miners deeply
  // red can be a value entry IF the regime hasn't flipped to risk-off
  // wholesale. We surface the number for prompts but the runner does not
  // currently gate on it (kept as a future hook).
  let longBonus = 0;
  if (Number.isFinite(minerMin)) {
    if (minerMin <= -SHORT_PENALTY_HIGH_PCT) longBonus = 2;
    else if (minerMin <= -SHORT_PENALTY_LOW_PCT) longBonus = 1;
  }

  const parts = REGIME_COMPONENT_SYMBOLS.map((sym) => {
    const c = components[sym];
    if (!c || c.dayChangePct == null) return `${sym}: n/a`;
    const pct = `${c.dayChangePct >= 0 ? "+" : ""}${c.dayChangePct.toFixed(2)}%`;
    return `${sym}: ${pct}`;
  });

  const summary = `${regime} (${parts.join(", ")}) — shortPenalty=${shortPenalty}, longBonus=${longBonus}`;

  return {
    regime,
    components,
    bullishCount,
    bearishCount,
    neutralCount,
    shortPenalty,
    longBonus,
    summary,
  };
}
