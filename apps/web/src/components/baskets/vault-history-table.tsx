"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { type Address } from "viem";
import { useConfig } from "wagmi";
import {
  ActivityBadge,
  formatHistoryAmount,
  formatHistoryLabel,
  formatHistoryTime,
  getBasketActivityMeta,
  hasRealisedPnl,
  RealisedPnlChip,
  SectionHeader,
} from "@/components/baskets/basket-detail-ui";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type BasketActivityRow,
  useBasketActivitiesInfiniteQuery,
} from "@/hooks/subgraph/useBasketDetail";
import { type AgentAction } from "@/hooks/useAgentMetadata";
import { useOracleAssetMetaMap } from "@/hooks/useOracle";
import { humanizeToolName } from "@/lib/agent-action-meta";
import { formatAssetId, formatSignedUsdcAmount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { yahooFinanceQuoteUrl } from "@/lib/yahoo-finance";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import {
  Bot,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock3,
  ExternalLink,
} from "lucide-react";

const HISTORY_PAGE_SIZE = 50;
const TBODY_ID = "vault-history-tbody";

type AssetMetaMap = Map<string, { name: string }>;

function resolveAssetDisplay(
  assetId: string,
  assetMetaMap: AssetMetaMap | undefined,
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

function AssetLabel({
  label,
  yfinanceSymbol,
  className,
}: {
  label: string;
  yfinanceSymbol?: string | null;
  className?: string;
}) {
  if (!yfinanceSymbol) {
    return <span className={cn("text-app-text", className)}>{label}</span>;
  }
  return (
    <a
      href={yahooFinanceQuoteUrl(yfinanceSymbol)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 text-app-text hover:text-app-accent",
        className,
      )}
      aria-label={`View ${label} on Yahoo Finance`}
    >
      {label}
      <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
    </a>
  );
}

function dayKey(timestamp: bigint): string {
  const date = new Date(Number(timestamp) * 1000);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function dayLabel(timestamp: bigint): string {
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function absoluteTime(timestamp: bigint): string {
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function realisedPnlClass(pnl: bigint): string {
  if (pnl > 0n) return "text-app-success";
  if (pnl < 0n) return "text-app-danger";
  return "text-app-muted";
}

function HistorySkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} className="border-b border-app-border">
          <td className="px-4 py-3">
            <Skeleton className="h-4 w-32" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-4 w-16" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="ml-auto h-4 w-20" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="ml-auto h-4 w-16" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-4 w-14" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="ml-auto h-4 w-20" />
          </td>
        </tr>
      ))}
    </>
  );
}

function AiJustificationBlock({ action }: { action: AgentAction }) {
  const toolLabel = action.tool ? humanizeToolName(action.tool) : null;
  return (
    <div className="rounded-md border border-app-accent/20 bg-app-accent/5 px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-app-accent">
        <Bot className="h-3 w-3 shrink-0" />
        <span>AI{action.agentName ? `: ${action.agentName}` : ""}</span>
        {toolLabel && (
          <>
            <span className="text-app-muted">·</span>
            <span className="font-mono normal-case tracking-normal text-app-text">
              {toolLabel}
            </span>
          </>
        )}
      </div>
      <p className="mt-1 text-xs italic leading-relaxed text-app-muted">
        {action.justification}
      </p>
    </div>
  );
}

function HistoryMobileRow({
  row,
  action,
  assetMetaMap,
}: {
  row: BasketActivityRow;
  action?: AgentAction;
  assetMetaMap: AssetMetaMap;
}) {
  const config = useConfig();
  const { chainId } = useDeploymentTarget();
  const explorer = config.chains.find((c) => c.id === chainId)?.blockExplorers?.default?.url;
  const txHref = explorer ? `${explorer}/tx/${row.txHash}` : "#";
  const meta = getBasketActivityMeta(row);
  const showRealisedPnl = hasRealisedPnl(row);
  const amountDisplay = formatHistoryAmount(row);
  const assetDisplay = row.assetId ? resolveAssetDisplay(row.assetId, assetMetaMap) : null;

  const rowHighlight =
    showRealisedPnl && row.pnl !== undefined
      ? row.pnl > 0n
        ? "bg-app-success/[0.06]"
        : row.pnl < 0n
          ? "bg-app-danger/[0.06]"
          : undefined
      : undefined;

  return (
    <div className={cn("flex items-start gap-3 px-4 py-4 text-sm", rowHighlight)}>
      <ActivityBadge meta={meta} />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-app-text">{formatHistoryLabel(row)}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-app-muted">
          {showRealisedPnl && row.pnl !== undefined && <RealisedPnlChip pnl={row.pnl} />}
          {meta.detail && <span>{meta.detail}</span>}
          {assetDisplay && meta.detail !== assetDisplay.label && (
            <AssetLabel label={assetDisplay.label} yfinanceSymbol={assetDisplay.yfinanceSymbol} />
          )}
          <span className="text-app-muted/80" title={absoluteTime(row.timestamp)}>
            {formatHistoryTime(row.timestamp)}
          </span>
        </div>
        {action && (
          <div className="mt-2">
            <AiJustificationBlock action={action} />
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className={amountDisplay.className}>{amountDisplay.value}</p>
        <a
          className="font-mono text-xs text-app-accent hover:underline"
          href={txHref}
          target="_blank"
          rel="noreferrer"
        >
          {`${row.txHash.slice(0, 6)}...${row.txHash.slice(-4)}`}
        </a>
      </div>
    </div>
  );
}

function HistoryDesktopRow({
  row,
  action,
  showDaySeparator,
  expanded,
  onToggleExpand,
  assetMetaMap,
}: {
  row: BasketActivityRow;
  action?: AgentAction;
  showDaySeparator: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  assetMetaMap: AssetMetaMap;
}) {
  const config = useConfig();
  const { chainId } = useDeploymentTarget();
  const explorer = config.chains.find((c) => c.id === chainId)?.blockExplorers?.default?.url;
  const txHref = explorer ? `${explorer}/tx/${row.txHash}` : "#";
  const meta = getBasketActivityMeta(row);
  const amountDisplay = formatHistoryAmount(row);
  const showRealisedPnl = hasRealisedPnl(row);
  const hasAi = Boolean(action);
  const assetDisplay = row.assetId ? resolveAssetDisplay(row.assetId, assetMetaMap) : null;

  const rowHighlight =
    showRealisedPnl && row.pnl !== undefined
      ? row.pnl > 0n
        ? "bg-app-success/[0.04] hover:bg-app-success/[0.08]"
        : row.pnl < 0n
          ? "bg-app-danger/[0.04] hover:bg-app-danger/[0.08]"
          : "hover:bg-app-surface-hover"
      : "hover:bg-app-surface-hover";

  return (
    <>
      {showDaySeparator && (
        <tr className="bg-app-bg-subtle/60">
          <td colSpan={6} className="px-4 py-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-app-muted">
              <CalendarDays className="h-3.5 w-3.5" />
              {dayLabel(row.timestamp)}
            </div>
          </td>
        </tr>
      )}
      <tr className={cn("border-b border-app-border transition-colors", rowHighlight)}>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            {hasAi && (
              <button
                type="button"
                onClick={onToggleExpand}
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-app-muted hover:bg-app-bg-subtle hover:text-app-text"
                aria-expanded={expanded}
                aria-label={expanded ? "Hide AI justification" : "Show AI justification"}
              >
                {expanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            )}
            <ActivityBadge meta={meta} />
            <div className="min-w-0">
              <p className="font-medium text-app-text">{meta.title}</p>
              {meta.detail && (
                <p className="mt-0.5 truncate text-xs text-app-muted">{meta.detail}</p>
              )}
            </div>
            {row.isLong !== undefined && (
              <span
                className={cn(
                  "ml-1 inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase",
                  row.isLong
                    ? "bg-app-success/10 text-app-success"
                    : "bg-app-danger/10 text-app-danger",
                )}
              >
                {row.isLong ? "Long" : "Short"}
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-2.5 text-app-text">
          {assetDisplay ? (
            <AssetLabel label={assetDisplay.label} yfinanceSymbol={assetDisplay.yfinanceSymbol} />
          ) : (
            "—"
          )}
        </td>
        <td className={cn("px-4 py-2.5 text-right", amountDisplay.className)}>
          {amountDisplay.value}
        </td>
        <td
          className={cn(
            "px-4 py-2.5 text-right font-mono text-sm",
            showRealisedPnl && row.pnl !== undefined
              ? realisedPnlClass(row.pnl)
              : "text-app-muted",
          )}
        >
          {showRealisedPnl && row.pnl !== undefined
            ? formatSignedUsdcAmount(row.pnl)
            : "—"}
        </td>
        <td
          className="px-4 py-2.5 text-xs text-app-muted"
          title={absoluteTime(row.timestamp)}
        >
          {formatHistoryTime(row.timestamp)}
        </td>
        <td className="px-4 py-2.5 text-right">
          <a
            className="font-mono text-xs text-app-accent hover:underline"
            href={txHref}
            target="_blank"
            rel="noreferrer"
          >
            {`${row.txHash.slice(0, 6)}…${row.txHash.slice(-4)}`}
          </a>
        </td>
      </tr>
      {hasAi && expanded && (
        <tr className="border-b border-app-border bg-app-accent/[0.03]">
          <td colSpan={6} className="px-4 py-3 pl-14">
            <AiJustificationBlock action={action!} />
          </td>
        </tr>
      )}
    </>
  );
}

function useInfiniteScrollSentinel(
  scrollRef: RefObject<HTMLDivElement | null>,
  sentinelRef: RefObject<HTMLDivElement | null>,
  hasNextPage: boolean,
  isFetchingNextPage: boolean,
  fetchNextPage: () => Promise<unknown>,
  rowCount: number,
) {
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { root, rootMargin: "120px", threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [scrollRef, sentinelRef, hasNextPage, isFetchingNextPage, fetchNextPage, rowCount]);
}

export function VaultHistoryTable({
  vault,
  actionByTxHash,
  className,
}: {
  vault: Address;
  actionByTxHash: Map<string, AgentAction>;
  className?: string;
}) {
  const desktopScrollRef = useRef<HTMLDivElement>(null);
  const desktopSentinelRef = useRef<HTMLDivElement>(null);
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const mobileSentinelRef = useRef<HTMLDivElement>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const { data: assetMetaMap = new Map() } = useOracleAssetMetaMap();
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useBasketActivitiesInfiniteQuery(vault, HISTORY_PAGE_SIZE);

  const rows = useMemo(
    () => (data?.pages.flat() ?? []) as BasketActivityRow[],
    [data?.pages],
  );

  const metaText = `${rows.length} loaded${hasNextPage ? "" : rows.length > 0 ? " · all history" : ""}`;

  const toggleExpand = useCallback((rowId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);

  useInfiniteScrollSentinel(
    desktopScrollRef,
    desktopSentinelRef,
    Boolean(hasNextPage),
    isFetchingNextPage,
    fetchNextPage,
    rows.length,
  );
  useInfiniteScrollSentinel(
    mobileScrollRef,
    mobileSentinelRef,
    Boolean(hasNextPage),
    isFetchingNextPage,
    fetchNextPage,
    rows.length,
  );

  const mobileGroups = useMemo(() => {
    const groups: Array<{ key: string; label: string; rows: BasketActivityRow[] }> = [];
    for (const row of rows) {
      const key = dayKey(row.timestamp);
      const label = dayLabel(row.timestamp);
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.rows.push(row);
      } else {
        groups.push({ key, label, rows: [row] });
      }
    }
    return groups;
  }, [rows]);

  return (
    <Card className={cn("p-5", className)}>
      <SectionHeader icon={Clock3} title="Vault History" meta={metaText} />

      {/* Desktop table */}
      <div
        ref={desktopScrollRef}
        className="hidden max-h-[36rem] overflow-y-auto overflow-x-auto rounded-xl border border-app-border sm:block"
      >
        <table role="table" className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-app-surface shadow-[0_1px_0_0_var(--app-border)]">
            <tr className="border-b border-app-border text-left text-[10px] font-semibold uppercase tracking-wider text-app-muted">
              <th scope="col" className="px-4 py-2.5">
                Event
              </th>
              <th scope="col" className="px-4 py-2.5">
                Asset
              </th>
              <th scope="col" className="px-4 py-2.5 text-right">
                Amount
              </th>
              <th scope="col" className="px-4 py-2.5 text-right">
                Realised PnL
              </th>
              <th scope="col" className="px-4 py-2.5">
                Time
              </th>
              <th scope="col" className="px-4 py-2.5 text-right">
                Tx
              </th>
            </tr>
          </thead>
          <tbody id={TBODY_ID} className="divide-y divide-app-border">
            {isLoading && !data ? (
              <HistorySkeletonRows />
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 text-sm text-app-muted">
                    <CalendarDays className="h-5 w-5" />
                    No vault activity indexed yet.
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const prevKey = index > 0 ? dayKey(rows[index - 1]!.timestamp) : null;
                const currentKey = dayKey(row.timestamp);
                return (
                  <HistoryDesktopRow
                    key={row.id}
                    row={row}
                    action={actionByTxHash.get(row.txHash.toLowerCase())}
                    showDaySeparator={prevKey !== currentKey}
                    expanded={expandedRows.has(row.id)}
                    onToggleExpand={() => toggleExpand(row.id)}
                    assetMetaMap={assetMetaMap}
                  />
                );
              })
            )}
            {isFetchingNextPage && <HistorySkeletonRows count={3} />}
            {!hasNextPage && rows.length > 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-3 text-center text-xs text-app-muted">
                  End of history · {rows.length} event{rows.length === 1 ? "" : "s"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div ref={desktopSentinelRef} aria-hidden className="h-1" />
      </div>

      {/* Mobile cards */}
      <div
        ref={mobileScrollRef}
        className="max-h-[36rem] overflow-y-auto overflow-x-hidden rounded-xl border border-app-border sm:hidden"
      >
        {isLoading && !data ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center text-sm text-app-muted">
            <CalendarDays className="h-5 w-5" />
            No vault activity indexed yet.
          </div>
        ) : (
          <div className="divide-y divide-app-border">
            {mobileGroups.map((group) => (
              <div key={group.key}>
                <div className="flex items-center gap-2 border-b border-app-border bg-app-bg-subtle/60 px-4 py-2.5 text-xs font-semibold text-app-muted">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {group.label}
                </div>
                <div className="divide-y divide-app-border">
                  {group.rows.map((row) => (
                    <HistoryMobileRow
                      key={row.id}
                      row={row}
                      action={actionByTxHash.get(row.txHash.toLowerCase())}
                      assetMetaMap={assetMetaMap}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {isFetchingNextPage && (
          <div className="space-y-3 p-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}
        {!hasNextPage && rows.length > 0 && (
          <p className="px-4 py-3 text-center text-xs text-app-muted">
            End of history · {rows.length} event{rows.length === 1 ? "" : "s"}
          </p>
        )}
        <div ref={mobileSentinelRef} aria-hidden className="h-1" />
      </div>

      {hasNextPage && !isFetchingNextPage && (
        <button
          type="button"
          className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-app-accent hover:underline"
          onClick={() => void fetchNextPage()}
          aria-controls={TBODY_ID}
        >
          Load more
        </button>
      )}
    </Card>
  );
}
