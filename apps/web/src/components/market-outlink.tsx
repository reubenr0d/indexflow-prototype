"use client";

import { useMemo, type AnchorHTMLAttributes, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { isCryptoAgentSymbol } from "@/lib/yahoo-finance";
import {
  resolveMarketOutlink,
  type MarketOutlink,
  type OracleSeedSource,
} from "@/lib/market-outlink";
import { useOracleSeedQuote } from "@/hooks/useOracleSeedQuote";

export type MarketOutlinkProps = {
  /** On-chain oracle symbol (e.g. BHP.AX, RNDR-USD). */
  oracleSymbol: string;
  /** Display text; defaults to oracleSymbol. */
  label?: string;
  seedSource?: OracleSeedSource;
  bybitSymbol?: string | null;
  yahooTicker?: string | null;
  /** When the UI is charting Bybit klines for this asset. */
  chartUsesBybit?: boolean;
  /** Skip live seed probe for crypto (when parent already has quote fields). */
  skipSeedProbe?: boolean;
  className?: string;
  iconClassName?: string;
  children?: ReactNode;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children">;

function useResolvedMarketOutlink(props: {
  oracleSymbol: string;
  seedSource?: OracleSeedSource;
  bybitSymbol?: string | null;
  yahooTicker?: string | null;
  chartUsesBybit?: boolean;
  skipSeedProbe?: boolean;
}): MarketOutlink | null {
  const sym = props.oracleSymbol.trim();
  const probe =
    !props.skipSeedProbe &&
    !props.seedSource &&
    !props.chartUsesBybit &&
    isCryptoAgentSymbol(sym);
  const { data: seedQuote } = useOracleSeedQuote(probe ? sym : undefined);

  return useMemo(() => {
    if (!sym) return null;
    const seedSource =
      props.seedSource ??
      (props.chartUsesBybit ? "bybit-index" : seedQuote?.source ?? null);
    return resolveMarketOutlink({
      oracleSymbol: sym,
      seedSource,
      bybitSymbol: props.bybitSymbol ?? seedQuote?.bybitSymbol,
      yahooTicker: props.yahooTicker ?? seedQuote?.yahooTicker,
      chartUsesBybit: props.chartUsesBybit,
    });
  }, [
    sym,
    props.seedSource,
    props.bybitSymbol,
    props.yahooTicker,
    props.chartUsesBybit,
    seedQuote?.source,
    seedQuote?.bybitSymbol,
    seedQuote?.yahooTicker,
  ]);
}

export function MarketOutlink({
  oracleSymbol,
  label,
  seedSource,
  bybitSymbol,
  yahooTicker,
  chartUsesBybit,
  skipSeedProbe,
  className,
  iconClassName,
  children,
  ...anchorProps
}: MarketOutlinkProps) {
  const link = useResolvedMarketOutlink({
    oracleSymbol,
    seedSource,
    bybitSymbol,
    yahooTicker,
    chartUsesBybit,
    skipSeedProbe,
  });

  if (!link) return null;

  const text = label ?? oracleSymbol;

  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 font-medium text-app-text hover:text-app-accent",
        className,
      )}
      aria-label={link.ariaLabel}
      {...anchorProps}
    >
      {children ?? text}
      <ExternalLink
        className={cn("h-3 w-3 shrink-0 opacity-60", iconClassName)}
        aria-hidden
      />
    </a>
  );
}

/** Text-only deep link (admin cards, footers). */
export function MarketOutlinkDeep({
  oracleSymbol,
  label,
  seedSource,
  bybitSymbol,
  yahooTicker,
  chartUsesBybit,
  skipSeedProbe,
  className,
  ...anchorProps
}: Omit<MarketOutlinkProps, "children" | "iconClassName"> & {
  label?: string;
}) {
  const link = useResolvedMarketOutlink({
    oracleSymbol,
    seedSource,
    bybitSymbol,
    yahooTicker,
    chartUsesBybit,
    skipSeedProbe,
  });

  if (!link) return null;

  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-medium text-app-accent underline underline-offset-2 hover:text-app-accent/80",
        className,
      )}
      aria-label={link.ariaLabel}
      {...anchorProps}
    >
      <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {label ?? `View on ${link.label}`}
    </a>
  );
}
