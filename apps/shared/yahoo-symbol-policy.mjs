/**
 * Shared Yahoo symbol policy for write-time safety.
 *
 * Rules:
 * - Suffixed equities (e.g. BHP.AX) are allowed when they resolve exactly.
 * - Unsuffixed equities are rejected only when they are ambiguous across exchanges
 *   (base ticker plus one or more base.suffix equity listings).
 * - Unique unsuffixed equities are allowed.
 * - Non-equity symbols are allowed.
 */

function toUpperTrim(value) {
  return String(value ?? "").trim().toUpperCase();
}

function hasExchangeSuffix(symbol) {
  const normalized = toUpperTrim(symbol);
  if (!normalized.includes(".")) return false;
  const [base, suffix] = normalized.split(".");
  return Boolean(base) && Boolean(suffix);
}

function looksNonEquity(symbol) {
  const normalized = toUpperTrim(symbol);
  return /[=^/:-]/.test(normalized);
}

function dedupe(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeSearchRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    symbol: toUpperTrim(row?.symbol),
    quoteType: toUpperTrim(row?.quoteType),
    exchange: String(row?.exchange ?? ""),
    name: String(row?.name ?? ""),
  }));
}

function getEquityFamily(base, rows) {
  return rows.filter((row) =>
    row.quoteType === "EQUITY" &&
    (row.symbol === base || row.symbol.startsWith(`${base}.`))
  );
}

/**
 * Classify symbol safety using Yahoo search rows.
 *
 * @param {string} requestedSymbol
 * @param {Array<{symbol?: string, quoteType?: string, exchange?: string, name?: string}>} searchRows
 */
export function classifySymbolWithSearch(requestedSymbol, searchRows) {
  const requested = toUpperTrim(requestedSymbol);
  const rows = normalizeSearchRows(searchRows);
  const suffixed = hasExchangeSuffix(requested);

  const base = requested.split(".")[0] ?? requested;
  const exact = rows.find((row) => row.symbol === requested) ?? null;
  const equityFamily = getEquityFamily(base, rows);
  const candidates = dedupe(
    equityFamily
      .map((row) => row.symbol)
      .filter((symbol) => symbol !== base && symbol.includes("."))
  );

  if (suffixed) {
    const resolved = Boolean(exact);
    if (resolved) {
      return {
        requestedSymbol: requested,
        resolvedSymbol: exact?.symbol ?? requested,
        exchange: exact?.exchange ?? "",
        isAmbiguous: false,
        allowed: true,
        candidates,
        reason: "suffixed_symbol_exact_match",
      };
    }

    return {
      requestedSymbol: requested,
      resolvedSymbol: null,
      exchange: "",
      isAmbiguous: false,
      allowed: false,
      candidates,
      reason: "suffixed_symbol_unresolved",
    };
  }

  if (exact && exact.quoteType && exact.quoteType !== "EQUITY") {
    return {
      requestedSymbol: requested,
      resolvedSymbol: exact.symbol,
      exchange: exact.exchange,
      isAmbiguous: false,
      allowed: true,
      candidates,
      reason: "non_equity_symbol",
    };
  }

  if (!exact && looksNonEquity(requested)) {
    return {
      requestedSymbol: requested,
      resolvedSymbol: requested,
      exchange: "",
      isAmbiguous: false,
      allowed: true,
      candidates,
      reason: "non_equity_symbol_pattern",
    };
  }

  if (candidates.length > 0) {
    return {
      requestedSymbol: requested,
      resolvedSymbol: exact?.symbol ?? requested,
      exchange: exact?.exchange ?? "",
      isAmbiguous: true,
      allowed: false,
      candidates,
      reason: "ambiguous_unsuffixed_equity",
    };
  }

  return {
    requestedSymbol: requested,
    resolvedSymbol: exact?.symbol ?? requested,
    exchange: exact?.exchange ?? "",
    isAmbiguous: false,
    allowed: true,
    candidates,
    reason: exact ? "unique_unsuffixed_equity" : "no_equity_family_found",
  };
}

/**
 * Human-readable recovery guidance when a symbol is rejected.
 */
export function symbolPolicyMessage(classification) {
  if (!classification || classification.allowed) return "";

  if (classification.reason === "ambiguous_unsuffixed_equity") {
    const examples = classification.candidates?.slice(0, 3) ?? [];
    if (examples.length > 0) {
      return `Ambiguous unsuffixed equity symbol "${classification.requestedSymbol}". Use an explicit exchange suffix: ${examples.join(", ")}.`;
    }
    return `Ambiguous unsuffixed equity symbol "${classification.requestedSymbol}". Use an explicit exchange suffix (e.g. <TICKER>.<EXCHANGE>).`;
  }

  if (classification.reason === "suffixed_symbol_unresolved") {
    return `Suffixed symbol "${classification.requestedSymbol}" did not resolve on Yahoo Finance.`;
  }

  return `Symbol "${classification.requestedSymbol}" is not allowed by symbol policy.`;
}
