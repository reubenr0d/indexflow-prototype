"use client";

import React, { useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Brain,
  Lightbulb,
  Quote,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Clock3,
} from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { getTooltipCopy, type TooltipKey } from "@/lib/tooltip-copy";
import { cn } from "@/lib/utils";
import { formatAssetId, formatRelativeTime } from "@/lib/format";
import { getToneChipClass } from "@/lib/agent-action-meta";
import { yahooFinanceQuoteUrl } from "@/lib/yahoo-finance";
import type { AgentAction, AgentRun } from "@/hooks/useAgentMetadata";

const SIGNAL_SOURCE_LABEL: Record<string, string> = {
  "atlas-ml": "Atlas ML",
  "atlas-quality": "Atlas Quality",
};

const ENTRY_MODE_LABEL: Record<string, string> = {
  ml_score: "ML score",
  quality_score: "Quality score",
  momentum_volume: "Momentum + volume",
  manual: "Manual",
};

// Pattern matches tickers that have a clear signal: either an exchange suffix
// (AHR.V, GTWO.TO, 0KXS.L) or are wrapped in parentheses ((CRML), (PWM.V)).
// Avoids false positives on common uppercase words like "AI", "ML", "USDC".
const TICKER_PATTERN =
  /(\b[A-Z0-9]{1,6}\.[A-Z]{1,3}\b|\(\s*[A-Z][A-Z0-9.\-]{1,7}\s*\))/g;

function isLikelyTicker(token: string): boolean {
  if (token.startsWith("(") && token.endsWith(")")) {
    const inner = token.slice(1, -1).trim();
    if (!inner) return false;
    return /^[A-Z][A-Z0-9.\-]{1,7}$/.test(inner);
  }
  return /^[A-Z0-9]{1,6}\.[A-Z]{1,3}$/.test(token);
}

// Pulls the bare Yahoo Finance symbol out of a matched ticker token. A
// suffix-exchange match (`AHR.V`) is already a Yahoo symbol; a parenthesized
// match (`(CRML)`) needs the wrapping parens stripped.
function tickerToYfinanceSymbol(token: string): string | null {
  if (token.startsWith("(") && token.endsWith(")")) {
    const inner = token.slice(1, -1).trim();
    return inner || null;
  }
  return token;
}

export function highlightTickers(text: string, keyPrefix = "tk"): React.ReactNode {
  if (!text) return text;
  const out: React.ReactNode[] = [];
  let lastIndex = 0;
  let chipCount = 0;
  TICKER_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TICKER_PATTERN.exec(text)) !== null) {
    const token = match[0];
    if (!isLikelyTicker(token)) continue;
    if (match.index > lastIndex) {
      out.push(text.slice(lastIndex, match.index));
    }
    const symbol = tickerToYfinanceSymbol(token);
    out.push(
      symbol ? (
        <a
          key={`${keyPrefix}-${chipCount++}`}
          href={yahooFinanceQuoteUrl(symbol)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View ${symbol} on Yahoo Finance`}
          className="mx-0.5 inline-flex items-center gap-0.5 rounded-sm border border-app-accent/30 bg-app-accent/10 px-1 font-mono text-[11px] text-app-accent transition-colors hover:border-app-accent/60 hover:bg-app-accent/20"
        >
          {token}
        </a>
      ) : (
        <span
          key={`${keyPrefix}-${chipCount++}`}
          className="mx-0.5 rounded-sm border border-app-accent/30 bg-app-accent/10 px-1 font-mono text-[11px] text-app-accent"
        >
          {token}
        </span>
      ),
    );
    lastIndex = match.index + token.length;
  }
  if (chipCount === 0) return text;
  if (lastIndex < text.length) {
    out.push(text.slice(lastIndex));
  }
  return <>{out}</>;
}

function mapStringChildren(
  children: React.ReactNode,
  keyPrefix: string,
): React.ReactNode {
  return React.Children.map(children, (child, idx) => {
    if (typeof child === "string") {
      return (
        <React.Fragment key={`${keyPrefix}-s-${idx}`}>
          {highlightTickers(child, `${keyPrefix}-${idx}`)}
        </React.Fragment>
      );
    }
    return child;
  });
}

const markdownComponents: Components = {
  p: ({ children, node: _node, ...props }) => (
    <p
      className="mt-2 text-[15px] leading-relaxed text-app-text first:mt-0"
      {...props}
    >
      {mapStringChildren(children, "p")}
    </p>
  ),
  strong: ({ children, node: _node, ...props }) => (
    <strong className="font-semibold text-app-text" {...props}>
      {mapStringChildren(children, "strong")}
    </strong>
  ),
  em: ({ children, node: _node, ...props }) => (
    <em className="text-app-text/90" {...props}>
      {mapStringChildren(children, "em")}
    </em>
  ),
  ul: ({ children, node: _node, ...props }) => (
    <ul
      className="mt-2 list-disc space-y-1 pl-5 text-[15px] leading-relaxed text-app-text"
      {...props}
    >
      {children}
    </ul>
  ),
  ol: ({ children, node: _node, ...props }) => (
    <ol
      className="mt-2 list-decimal space-y-1 pl-5 text-[15px] leading-relaxed text-app-text"
      {...props}
    >
      {children}
    </ol>
  ),
  li: ({ children, node: _node, ...props }) => (
    <li className="leading-relaxed" {...props}>
      {mapStringChildren(children, "li")}
    </li>
  ),
  h1: ({ children, node: _node, ...props }) => (
    <h4
      className="mt-3 text-sm font-semibold uppercase tracking-[0.18em] text-app-muted first:mt-0"
      {...props}
    >
      {mapStringChildren(children, "h1")}
    </h4>
  ),
  h2: ({ children, node: _node, ...props }) => (
    <h4
      className="mt-3 text-sm font-semibold uppercase tracking-[0.18em] text-app-muted first:mt-0"
      {...props}
    >
      {mapStringChildren(children, "h2")}
    </h4>
  ),
  h3: ({ children, node: _node, ...props }) => (
    <h5
      className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-app-muted first:mt-0"
      {...props}
    >
      {mapStringChildren(children, "h3")}
    </h5>
  ),
  code: ({ children, node: _node, ...props }) => (
    <code
      className="rounded-sm border border-app-border bg-app-bg-subtle px-1 font-mono text-[12px] text-app-text"
      {...props}
    >
      {children}
    </code>
  ),
  a: ({ children, href, node: _node, ...props }) => (
    <a
      href={href}
      className="text-app-accent underline decoration-app-accent/40 underline-offset-2 hover:decoration-app-accent"
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel={href?.startsWith("http") ? "noreferrer" : undefined}
      {...props}
    >
      {mapStringChildren(children, "a")}
    </a>
  ),
};

type TopPick = {
  key: string;
  label: string;
  isLong: boolean;
  yfinanceSymbol: string | null;
};

export type AssetMetaMap = Map<string, { name: string }>;

// Picks the human ticker (e.g. `AHR.V`) for a top-pick chip. Agent
// metadata stores `assetId` as a keccak-style bytes32 in production, so
// `formatAssetId` falls back to a truncated hex (`0x7557d8b4...a4ddd1f6`).
// When an oracle meta map is available, prefer the on-chain symbol — that
// matches what positions-table.tsx already renders for open positions.
function resolveTickerForAsset(
  assetId: string,
  assetMetaMap?: AssetMetaMap,
): { label: string; yfinanceSymbol: string | null } {
  const decoded = formatAssetId(assetId);
  const decodedIsTicker = decoded && !decoded.startsWith("0x");

  const onChain = assetMetaMap?.get(assetId.toLowerCase())?.name;
  if (onChain && !onChain.startsWith("0x")) {
    return { label: onChain, yfinanceSymbol: onChain };
  }

  if (decodedIsTicker) {
    return { label: decoded, yfinanceSymbol: decoded };
  }

  return { label: decoded, yfinanceSymbol: null };
}

function deriveTopPicks(
  recentActions: AgentAction[],
  latestRunId?: string | null,
  assetMetaMap?: AssetMetaMap,
): TopPick[] {
  if (!recentActions?.length) return [];
  const targetRun =
    latestRunId ?? recentActions.find((a) => a.runId)?.runId ?? null;
  const seen = new Set<string>();
  const picks: TopPick[] = [];
  for (const action of recentActions) {
    if (action.tool !== "open_position") continue;
    if (action.params?.kind !== "open_position") continue;
    if (targetRun && action.runId !== targetRun) continue;
    const key = `${action.params.assetId}-${action.params.isLong ? "L" : "S"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { label, yfinanceSymbol } = resolveTickerForAsset(
      action.params.assetId,
      assetMetaMap,
    );
    picks.push({
      key,
      label,
      isLong: action.params.isLong,
      yfinanceSymbol,
    });
  }
  return picks;
}

function shouldClampThesis(text: string): boolean {
  if (!text) return false;
  if (text.length > 360) return true;
  if ((text.match(/\n\n/g)?.length ?? 0) >= 1) return true;
  return false;
}

function HeaderChip({
  icon: Icon,
  label,
  tone = "accent",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone?: "accent" | "muted";
}) {
  const toneClass =
    tone === "accent"
      ? "border-app-accent/25 bg-app-accent/10 text-app-accent"
      : "border-app-border bg-app-bg-subtle text-app-muted";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
        toneClass,
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function PickChip({ pick }: { pick: TopPick }) {
  const toneClass = getToneChipClass(pick.isLong ? "success" : "danger");
  const Icon = pick.isLong ? TrendingUp : TrendingDown;
  const baseClass = cn(
    "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold",
    toneClass,
  );
  const inner = (
    <>
      <Icon className="h-3 w-3" />
      <span className="uppercase tracking-wide">
        {pick.isLong ? "Long" : "Short"}
      </span>
      <span className="font-mono">{pick.label}</span>
    </>
  );
  if (!pick.yfinanceSymbol) {
    return <span className={baseClass}>{inner}</span>;
  }
  return (
    <a
      href={yahooFinanceQuoteUrl(pick.yfinanceSymbol)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`View ${pick.yfinanceSymbol} on Yahoo Finance`}
      className={cn(baseClass, "transition-colors hover:underline")}
    >
      {inner}
    </a>
  );
}

interface VaultThesisCardProps {
  thesis: string | null | undefined;
  signalSource?: string | null;
  entryMode?: string | null;
  lastRunAt?: string | null;
  agentName?: string;
  agentDescription?: string;
  latestRun?: AgentRun;
  recentActions?: AgentAction[];
  // Optional bytes32-asset-id → on-chain ticker map. Lets top-picks chips
  // render the human ticker (and outlink to Yahoo Finance) when agent
  // metadata stores assetId as a keccak-style hash rather than ASCII bytes.
  assetMetaMap?: AssetMetaMap;
  tooltipKey?: TooltipKey;
  className?: string;
}

export function VaultThesisCard({
  thesis,
  signalSource,
  entryMode,
  lastRunAt,
  agentDescription,
  latestRun,
  recentActions,
  assetMetaMap,
  tooltipKey = "vaultThesis",
  className,
}: VaultThesisCardProps) {
  const [expanded, setExpanded] = useState(false);

  const trimmedThesis = (thesis ?? "").trim();
  const hasThesis = trimmedThesis.length > 0;

  const lastRunSeconds = useMemo(() => {
    if (!lastRunAt) return null;
    const ms = new Date(lastRunAt).getTime();
    if (Number.isNaN(ms)) return null;
    return Math.floor(ms / 1000);
  }, [lastRunAt]);
  const lastRunRelative = lastRunSeconds
    ? formatRelativeTime(lastRunSeconds)
    : null;

  const signalSourceLabel = signalSource
    ? SIGNAL_SOURCE_LABEL[signalSource] ?? signalSource
    : null;
  const entryModeLabel = entryMode
    ? ENTRY_MODE_LABEL[entryMode] ?? entryMode
    : null;

  const topPicks = useMemo(
    () => deriveTopPicks(recentActions ?? [], latestRun?.runId, assetMetaMap),
    [recentActions, latestRun?.runId, assetMetaMap],
  );

  const shouldClamp = hasThesis && shouldClampThesis(trimmedThesis);
  const canCollapseFallback =
    !hasThesis && !!latestRun?.summary && shouldClampThesis(latestRun.summary);
  const showReadMore = shouldClamp || canCollapseFallback;

  const tooltipContent = getTooltipCopy(tooltipKey);

  return (
    <section
      data-testid="vault-thesis-card"
      className={cn(
        "relative overflow-hidden rounded-xl border border-app-accent/30 bg-gradient-to-br from-app-accent/10 via-app-accent/5 to-transparent shadow-[var(--shadow)]",
        className,
      )}
    >
      <Quote
        aria-hidden
        className="pointer-events-none absolute -right-2 -top-2 h-20 w-20 rotate-12 text-app-accent/15"
      />
      <div className="relative border-l-4 border-app-accent/70 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-app-accent/30 bg-app-accent/10 text-app-accent">
                <Lightbulb className="h-3.5 w-3.5" />
              </span>
              <h3 className="text-base font-semibold tracking-tight text-app-text">
                Vault Thesis
              </h3>
              <InfoTooltip
                content={tooltipContent}
                ariaLabel="About Vault Thesis"
              />
            </div>
            <p className="mt-1 pl-9 text-xs text-app-muted">
              AI operator strategy
              {agentDescription ? ` · ${agentDescription}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {signalSourceLabel && (
              <HeaderChip icon={Brain} label={signalSourceLabel} tone="accent" />
            )}
            {entryModeLabel && (
              <HeaderChip icon={Sparkles} label={entryModeLabel} tone="muted" />
            )}
            {lastRunRelative && (
              <HeaderChip
                icon={Clock3}
                label={`Updated ${lastRunRelative}`}
                tone="muted"
              />
            )}
          </div>
        </div>

        {topPicks.length > 0 && (
          <div
            className="mt-4 flex items-center gap-2"
            data-testid="vault-thesis-top-picks"
          >
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-app-muted">
              Top picks
            </span>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 overflow-x-auto pb-0.5">
              {topPicks.map((pick) => (
                <PickChip key={pick.key} pick={pick} />
              ))}
            </div>
          </div>
        )}

        <div
          className={cn(
            "mt-4 transition-[max-height] duration-200 ease-out",
            showReadMore && !expanded ? "line-clamp-5" : "",
          )}
          data-testid="vault-thesis-body"
        >
          {hasThesis ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {trimmedThesis}
            </ReactMarkdown>
          ) : latestRun?.summary ? (
            <div data-testid="vault-thesis-fallback">
              <p className="text-xs italic text-app-muted">
                Thesis pending — showing the latest run summary while the
                operator finalizes its strategy write-up.
              </p>
              <div className="mt-2">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {latestRun.summary}
                </ReactMarkdown>
              </div>
            </div>
          ) : (
            <div
              className="flex items-center gap-2 text-sm text-app-muted"
              data-testid="vault-thesis-empty"
            >
              <Lightbulb className="h-4 w-4 shrink-0 text-app-muted/60" />
              <span>
                Awaiting first run — the AI operator will publish its thesis
                once it has executed at least one decision.
              </span>
            </div>
          )}
        </div>

        {showReadMore && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            data-testid="vault-thesis-toggle"
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-app-accent hover:underline"
          >
            {expanded ? "Read less" : "Read more"}
          </button>
        )}
      </div>
    </section>
  );
}
