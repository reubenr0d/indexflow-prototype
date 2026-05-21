"use client";

import { use, useMemo, useState } from "react";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Card } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { getTooltipCopy } from "@/lib/tooltip-copy";
import { DepositRedeemPanel } from "@/components/baskets/deposit-redeem-panel";
import dynamic from "next/dynamic";
import { MetricsStrip } from "@/components/baskets/metrics-strip";

const SharePriceChart = dynamic(
  () => import("@/components/baskets/share-price-chart").then((m) => m.SharePriceChart),
  { ssr: false },
);
const AssetPricePanel = dynamic(
  () => import("@/components/baskets/asset-price-panel").then((m) => m.AssetPricePanel),
  { ssr: false },
);
import { PositionsTable } from "@/components/baskets/positions-table";
import { CompositionSidebar } from "@/components/baskets/composition-sidebar";
import {
  ActivityBadge,
  AiOperatorBadge,
  AtlasMlBadge,
  type BasketHistoryRow,
  StatusChip,
  SectionHeader,
  formatHistoryLabel,
  formatHistoryTime,
  getBasketActivityMeta,
  groupHistoryRowsByDay,
} from "@/components/baskets/basket-detail-ui";
import { type AgentAction, useAgentMetadata } from "@/hooks/useAgentMetadata";
import { BasketTour } from "@/components/onboarding/basket-tour";
import { useBasketDashboardData } from "@/hooks/useBasketDashboardData";
import {
  type BasketActivityRow,
  useBasketActivitiesQuery,
} from "@/hooks/subgraph/useBasketDetail";
import { useAccount, useConfig, useReadContract } from "wagmi";
import { BasketShareTokenABI } from "@/abi/BasketShareToken";
import {
  formatUSDC,
  formatBps,
  formatAddress,
  formatPrice,
  formatRelativeTime,
  formatSignedUsd1e30,
  formatUsd1e30,
  formatAssetId,
} from "@/lib/format";
import { formatApy } from "@/lib/apy";
import { type Address } from "viem";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Bot,
  CalendarDays,
  Clock3,
  Coins,
  Copy,
  Gauge,
  Landmark,
  Layers,
  Lightbulb,
  LineChart,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Target,
  TrendingUp,
} from "lucide-react";
import { showToast } from "@/components/ui/toast";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";

const HISTORY_PAGE_SIZE = 20;

export default function BasketDetailPage({ params }: { params: Promise<{ address: string }> }) {
  const { address: vaultAddress } = use(params);
  const vault = vaultAddress as Address;
  const { address: userAddress } = useAccount();

  const {
    basketInfo,
    state,
    isInfoLoading,
    tvl,
    idleUsdc,
    requiredReserve,
    reserveHealthy,
    collectedFeesUsdc,
    depositFee,
    redeemFee,
    unrealisedPnL,
    realisedPnL,
    netPnL,
    capitalUtilPct,
    leverageRatio,
    configuredAssetIds,
    blended,
    showAllocatedComposition,
    assetMeta,
    apy7d,
  } = useBasketDashboardData(vault);

  const [historySkip, setHistorySkip] = useState(0);
  const subgraphHistory = useBasketActivitiesQuery(vault, HISTORY_PAGE_SIZE, historySkip);

  const { data: shareBalance } = useReadContract({
    address: basketInfo?.shareToken,
    abi: BasketShareTokenABI,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress && !!basketInfo?.shareToken },
  });

  const { data: agentMeta } = useAgentMetadata(vault);

  const hasPnLData = unrealisedPnL !== 0n || realisedPnL !== 0n || (state?.registered ?? false);

  const historyRows = useMemo(
    () => (subgraphHistory.data ?? []) as BasketHistoryRow[],
    [subgraphHistory.data],
  );
  const canLoadMore = (subgraphHistory.data?.length ?? 0) === HISTORY_PAGE_SIZE;
  const historyGroups = useMemo(() => groupHistoryRowsByDay(historyRows), [historyRows]);
  const latestActivityMeta = historyRows[0] ? getBasketActivityMeta(historyRows[0]) : undefined;

  const actionByTxHash = useMemo(() => {
    if (!agentMeta?.recentActions) return new Map<string, AgentAction>();
    const map = new Map<string, AgentAction>();
    for (const a of agentMeta.recentActions) {
      if (a.txHash && a.justification) map.set(a.txHash.toLowerCase(), a);
    }
    return map;
  }, [agentMeta]);

  const handleCopyShareToken = async () => {
    if (!basketInfo?.shareToken || typeof navigator === "undefined") return;
    try {
      await navigator.clipboard.writeText(basketInfo.shareToken);
      showToast("success", "Share token address copied");
    } catch {
      showToast("error", "Failed to copy share token address");
    }
  };

  // ---- Metrics strip data ----

  const netPnlSign = netPnL > 0n ? 1 : netPnL < 0n ? -1 : 0;
  const unrealisedSign = unrealisedPnL > 0n ? 1 : unrealisedPnL < 0n ? -1 : 0;

  const apySign = apy7d !== null ? (apy7d > 0 ? 1 : apy7d < 0 ? -1 : 0) : 0;

  const metricsData = [
    { label: "TVL", value: formatUSDC(tvl), icon: Landmark, testId: "metric-tvl" },
    { label: "Share Price", value: formatPrice(basketInfo?.sharePrice ?? 0n), icon: Coins, testId: "metric-share-price" },
    { label: "APY (7d)", value: formatApy(apy7d), pnl: apy7d !== null, sign: apySign, icon: TrendingUp, testId: "metric-apy" },
    { label: "Total Shares", value: basketInfo?.totalSupply ? (Number(basketInfo.totalSupply) / 1e6).toLocaleString() : "0", icon: Layers, testId: "metric-total-shares" },
    ...(hasPnLData
      ? [
          { label: "Net PnL", value: formatSignedUsd1e30(netPnL), pnl: true, sign: netPnlSign, icon: Activity, testId: "metric-net-pnl" },
          { label: "Unrealised", value: formatSignedUsd1e30(unrealisedPnL), pnl: true, sign: unrealisedSign, icon: LineChart, testId: "metric-unrealised-pnl" },
        ]
      : []),
    ...(state?.registered
      ? [
          { label: "Open Interest", value: formatUsd1e30(state.openInterest), icon: Target, testId: "metric-open-interest" },
          { label: "Leverage", value: `${leverageRatio.toFixed(2)}x`, icon: Scale, testId: "metric-leverage" },
          { label: "Capital Util", value: `${capitalUtilPct.toFixed(1)}%`, icon: Gauge, testId: "metric-capital-util" },
        ]
      : []),
    { label: "Dep Fee", value: depositFee !== undefined ? formatBps(depositFee) : "--", icon: ArrowDownToLine, testId: "metric-deposit-fee" },
    { label: "Red Fee", value: redeemFee !== undefined ? formatBps(redeemFee) : "--", icon: ArrowUpFromLine, testId: "metric-redeem-fee" },
  ];

  if (isInfoLoading) {
    return (
      <PageWrapper className="py-6 sm:py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Skeleton className="mb-2 h-8 w-48" />
            <Skeleton className="mb-6 h-4 w-32" />
            <Skeleton className="mb-8 h-12 w-36" />
            <Skeleton className="h-64 w-full" />
          </div>
          <div className="lg:col-span-1">
            <Skeleton className="h-80 w-full rounded-2xl" />
          </div>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper className="py-6 sm:py-8">
      <BasketTour />
      {/* ── Hero card (compact) ── */}
      <Card className="mb-6 overflow-hidden border border-app-border shadow-[var(--shadow)]">
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(13,148,136,0.12),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(12,74,110,0.08),transparent_42%)]" />
          <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-app-text lg:text-3xl">
                {basketInfo?.name || "Basket"}
              </h1>
              {basketInfo?.shareToken && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="font-mono text-xs text-app-muted">{formatAddress(basketInfo.shareToken)}</span>
                  <button
                    type="button"
                    onClick={handleCopyShareToken}
                    className="inline-flex items-center gap-1 rounded-md border border-app-border bg-app-surface px-2 py-1 text-[11px] font-semibold text-app-text transition-colors hover:border-app-border-strong hover:bg-app-surface-hover"
                  >
                    <Copy className="h-3 w-3" />
                    Copy
                  </button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {agentMeta?.isAiManaged && <AiOperatorBadge tooltipKey="aiOperator" />}
              {agentMeta?.signalSource === "atlas-ml" && (
                <AtlasMlBadge tooltipKey="atlasMl" />
              )}
              <StatusChip
                icon={reserveHealthy ? ShieldCheck : ShieldAlert}
                label={reserveHealthy ? "Healthy" : "Below target"}
                tone={reserveHealthy ? "success" : "danger"}
              />
              <StatusChip
                icon={latestActivityMeta?.icon ?? Activity}
                label={latestActivityMeta ? latestActivityMeta.title : "No recent activity"}
                tone={latestActivityMeta?.tone ?? "muted"}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* ── AI Activity (AI-managed vaults) ── */}
      {agentMeta?.isAiManaged && (
        <AiActivitySection
          vault={vault}
          agentMeta={agentMeta}
          className="mb-6"
        />
      )}

      {/* ── Metrics grid ── */}
      <div data-tour="metrics">
        <MetricsStrip metrics={metricsData} className="mb-6" />
      </div>

      {/* ── Main layout: flex column on mobile, 3-col grid on desktop ── */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-3 lg:gap-8">

        {/* ── Sidebar: Deposit/Redeem + Composition (right on desktop) ── */}
        <div className="order-1 lg:order-none lg:col-span-1 lg:col-start-3 lg:row-span-4 lg:row-start-1">
          <div className="lg:sticky lg:top-20 lg:space-y-6" data-tour="deposit-panel">
            <DepositRedeemPanel
              vault={vault}
              sharePrice={basketInfo?.sharePrice ?? 0n}
              depositFeeBps={depositFee ?? 0n}
              redeemFeeBps={redeemFee ?? 0n}
              shareBalance={shareBalance as bigint | undefined}
            />
            <div className="hidden lg:block">
              <CompositionSidebar
                blended={blended}
                assetMeta={assetMeta}
                reserveHealthy={reserveHealthy}
                idleUsdc={idleUsdc}
                requiredReserve={requiredReserve}
                collectedFeesUsdc={collectedFeesUsdc}
                showComposition={showAllocatedComposition}
              />
            </div>
          </div>
        </div>

        {/* ── Share price chart ── */}
        <div className="order-2 lg:order-none lg:col-span-2" data-tour="share-chart">
          <SharePriceChart vault={vault} />
        </div>

        {/* ── Positions table ── */}
        <div className="order-3 lg:order-none lg:col-span-2" data-tour="positions">
          <PositionsTable vault={vault} />
        </div>

        {/* ── Asset price panel ── */}
        <div className="order-4 lg:order-none lg:col-span-2">
          <AssetPricePanel assetIds={configuredAssetIds} />
        </div>

        {/* ── Composition (mobile only, hidden on lg where it's in sidebar) ── */}
        <div className="order-5 lg:hidden">
          <CompositionSidebar
            blended={blended}
            assetMeta={assetMeta}
            reserveHealthy={reserveHealthy}
            idleUsdc={idleUsdc}
            requiredReserve={requiredReserve}
            collectedFeesUsdc={collectedFeesUsdc}
            showComposition={showAllocatedComposition}
          />
        </div>

        {/* ── Vault history ── */}
        <div className="order-6 lg:order-none lg:col-span-2">
          <Card className="p-5">
            <SectionHeader
              icon={Clock3}
              title="Vault History"
              meta={`${historyRows.length} shown across ${historyGroups.length} day bucket${historyGroups.length === 1 ? "" : "s"}`}
            />
            <div className="max-h-[32rem] overflow-y-auto overflow-x-hidden rounded-xl border border-app-border">
              {historyRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center text-sm text-app-muted">
                  <CalendarDays className="h-5 w-5 text-app-muted" />
                  No vault activity indexed yet.
                </div>
              ) : (
                <div className="divide-y divide-app-border">
                  {historyGroups.map((group) => (
                    <div key={group.key} className="bg-app-surface">
                      <div className="flex items-center justify-between gap-3 border-b border-app-border bg-app-bg-subtle/60 px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-app-border bg-app-surface text-app-text">
                            <CalendarDays className="h-3.5 w-3.5" />
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-app-text">{group.label}</p>
                            <p className="text-xs text-app-muted">
                              {group.rows.length} event{group.rows.length === 1 ? "" : "s"}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="divide-y divide-app-border">
                        {group.rows.map((row) => (
                          <HistoryRowView
                            key={row.id}
                            row={row}
                            action={actionByTxHash.get(row.txHash.toLowerCase())}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {subgraphHistory.data && canLoadMore && (
              <button
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-app-accent hover:underline"
                onClick={() => setHistorySkip((s) => s + HISTORY_PAGE_SIZE)}
              >
                Load more
              </button>
            )}
          </Card>
        </div>
      </div>
    </PageWrapper>
  );
}

function HistoryRowView({
  row,
  action,
}: {
  row: BasketHistoryRow | BasketActivityRow;
  action?: AgentAction;
}) {
  const config = useConfig();
  const { chainId } = useDeploymentTarget();
  const explorer = config.chains.find((c) => c.id === chainId)?.blockExplorers?.default?.url;
  const txHref = explorer ? `${explorer}/tx/${row.txHash}` : "#";
  const meta = getBasketActivityMeta(row);
  const toolLabel = action ? humanizeToolName(action.tool) : null;

  return (
    <div className="flex items-start gap-3 px-4 py-4 text-sm">
      <ActivityBadge meta={meta} />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-app-text">{formatHistoryLabel(row)}</p>
        <p className="mt-1 text-xs text-app-muted">
          {[meta.detail, row.assetId ? formatAssetId(row.assetId) : undefined, formatHistoryTime(row.timestamp)]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {action && (
          <div className="mt-2 rounded-md border border-app-accent/20 bg-app-accent/5 px-2.5 py-1.5">
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
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-app-text">
          {row.amountUsdc !== undefined
            ? formatUSDC(row.amountUsdc)
            : row.size !== undefined
              ? formatUsd1e30(row.size)
              : row.pnl !== undefined
                ? formatSignedUsd1e30(row.pnl)
                : "--"}
        </p>
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

function humanizeToolName(tool: string): string {
  if (!tool) return "";
  return tool
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function AiActivitySection({
  vault,
  agentMeta,
  className,
}: {
  vault: Address;
  agentMeta: NonNullable<ReturnType<typeof useAgentMetadata>["data"]>;
  className?: string;
}) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [decisionsOpen, setDecisionsOpen] = useState(false);
  const config = useConfig();
  const { chainId } = useDeploymentTarget();
  const explorer = config.chains.find((c) => c.id === chainId)?.blockExplorers?.default?.url;

  const allDecisions = agentMeta.recentActions ?? [];
  const lastRunIso = agentMeta.latestRun?.finishedAt || agentMeta.lastRunAt;
  const lastRunSeconds = lastRunIso ? Math.floor(new Date(lastRunIso).getTime() / 1000) : null;
  const lastRunRelative = lastRunSeconds ? formatRelativeTime(lastRunSeconds) : null;

  return (
    <Card
      className={`border-app-accent/20 bg-app-accent/5 p-4 ${className ?? ""}`}
      data-testid={`ai-activity-${vault}`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-app-accent/25 bg-app-accent/10 text-app-accent">
            <Bot className="h-3.5 w-3.5" />
          </span>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-app-text">AI Operator</h3>
              <InfoTooltipLazy tooltipKey="aiOperator" ariaLabel="About AI Operator" />
            </div>
            {agentMeta.agentName && (
              <p className="text-[11px] text-app-muted">
                <span className="font-mono">{agentMeta.agentName}</span>
                {agentMeta.agentDescription ? ` · ${agentMeta.agentDescription}` : ""}
              </p>
            )}
          </div>
        </div>
        {lastRunRelative && (
          <p className="text-[11px] text-app-muted">
            Last run · <span className="text-app-text">{lastRunRelative}</span>
          </p>
        )}
      </div>

      {/* Thesis */}
      {agentMeta.thesis && (
        <div className="mt-4 rounded-md border border-app-border bg-app-surface p-3">
          <div className="flex items-center gap-1.5">
            <Lightbulb className="h-4 w-4 shrink-0 text-app-accent" />
            <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-app-muted">
              Vault Thesis
            </h4>
            <InfoTooltipLazy tooltipKey="vaultThesis" ariaLabel="About Vault Thesis" />
          </div>
          <p className="mt-2 text-sm leading-relaxed text-app-text">{agentMeta.thesis}</p>
        </div>
      )}

      {/* Latest run summary (collapsible) */}
      {agentMeta.latestRun?.summary && (
        <div className="mt-3">
          <button
            type="button"
            className="text-xs font-semibold text-app-accent hover:underline"
            onClick={() => setSummaryOpen((v) => !v)}
            aria-expanded={summaryOpen}
          >
            {summaryOpen ? "Hide latest run summary" : "Show latest run summary"}
          </button>
          {summaryOpen && (
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-app-border bg-app-bg-subtle/60 p-3 font-sans text-xs leading-relaxed text-app-muted">
              {agentMeta.latestRun.summary}
            </pre>
          )}
        </div>
      )}

      {/* All decisions (collapsed by default) */}
      {allDecisions.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            className="flex items-center gap-1 text-xs font-semibold text-app-accent hover:underline"
            onClick={() => setDecisionsOpen((v) => !v)}
            aria-expanded={decisionsOpen}
            aria-controls="ai-all-decisions"
          >
            <span>
              {decisionsOpen ? "Hide all decisions" : "Show all decisions"}
            </span>
            <span className="font-mono text-[10px] text-app-muted">
              ({allDecisions.length})
            </span>
          </button>
          {decisionsOpen && (
            <ul
              id="ai-all-decisions"
              className="mt-2 max-h-96 space-y-2 overflow-y-auto pr-1"
            >
              {allDecisions.map((a, i) => {
                const ts = a.timestamp ? Math.floor(new Date(a.timestamp).getTime() / 1000) : null;
                const rel = ts ? formatRelativeTime(ts) : null;
                const txHref = explorer && a.txHash ? `${explorer}/tx/${a.txHash}` : null;
                return (
                  <li
                    key={`${a.txHash ?? "no-tx"}-${i}`}
                    className="rounded-md border border-app-border bg-app-surface p-3"
                  >
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-app-accent">
                      <span className="font-mono normal-case tracking-normal text-app-text">
                        {humanizeToolName(a.tool)}
                      </span>
                      {rel && (
                        <>
                          <span className="text-app-muted">·</span>
                          <span className="normal-case tracking-normal text-app-muted">{rel}</span>
                        </>
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-app-text">{a.justification}</p>
                    {txHref && (
                      <a
                        className="mt-1 inline-block font-mono text-[11px] text-app-accent hover:underline"
                        href={txHref}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {`${a.txHash!.slice(0, 6)}...${a.txHash!.slice(-4)}`}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

function InfoTooltipLazy({
  tooltipKey,
  ariaLabel,
}: {
  tooltipKey: Parameters<typeof getTooltipCopy>[0];
  ariaLabel: string;
}) {
  const content = getTooltipCopy(tooltipKey);
  return <InfoTooltip content={content} ariaLabel={ariaLabel} />;
}
