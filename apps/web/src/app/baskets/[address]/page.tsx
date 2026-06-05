"use client";

import { use, useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
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
import { VaultHistoryTable } from "@/components/baskets/vault-history-table";
import { VaultThesisCard } from "@/components/baskets/vault-thesis-card";
import {
  AiOperatorBadge,
  StatusChip,
  getBasketActivityMeta,
} from "@/components/baskets/basket-detail-ui";
import { type AgentAction, useAgentMetadata } from "@/hooks/useAgentMetadata";
import { useOracleAssetMetaMap } from "@/hooks/useOracle";
import {
  getActionMeta,
  getToneChipClass,
  getToneTileClass,
  humanizeToolName,
  renderActionChips,
} from "@/lib/agent-action-meta";
import { BasketTour } from "@/components/onboarding/basket-tour";
import { useBasketDashboardData } from "@/hooks/useBasketDashboardData";
import {
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
  formatSignedUsdcAmount,
  formatUsd1e30,
  formatLeverageRatio,
  formatPnLPct,
  computePnLPctBps,
} from "@/lib/format";
import { formatApy } from "@/lib/apy";
import {
  buildAgentRunGroups,
  type AgentRunGroup,
} from "@/lib/agent-runs";
import { type Address } from "viem";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Bot,
  Brain,
  ChevronDown,
  ChevronUp,
  CircleSlash,
  Clock3,
  Coins,
  Copy,
  ExternalLink,
  Gauge,
  Landmark,
  Layers,
  LineChart,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { showToast } from "@/components/ui/toast";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { formatPnlSinceSubtext } from "@/components/baskets/pnl-since";

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
    configuredAssetIds,
    blended,
    showAllocatedComposition,
    assetMeta,
    apy7d,
    subgraphSharePrice,
    subgraphCreatedAt,
  } = useBasketDashboardData(vault);

  const latestActivityQuery = useBasketActivitiesQuery(vault, 1, 0);

  const { data: shareBalance } = useReadContract({
    address: basketInfo?.shareToken,
    abi: BasketShareTokenABI,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress && !!basketInfo?.shareToken },
  });

  const { data: agentMeta } = useAgentMetadata(vault);

  const hasPnLData = unrealisedPnL !== 0n || realisedPnL !== 0n || (state?.registered ?? false);

  const latestActivityMeta = latestActivityQuery.data?.[0]
    ? getBasketActivityMeta(latestActivityQuery.data[0])
    : undefined;

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
  // PnL tile mirrors the basket-list card's `PnL` chip: NAV growth per share
  // since inception. Sourced from the same Envio `Basket` entity the list
  // reads (`subgraphSharePrice`) so the two views never disagree because of
  // RPC vs indexer lag — even when the live `getBasketInfo` RPC has moved
  // ahead of (or behind) the indexer for this vault.
  const pnlBps = subgraphSharePrice !== null ? computePnLPctBps(subgraphSharePrice) : 0n;
  const pnlSign = pnlBps > 0n ? 1 : pnlBps < 0n ? -1 : 0;
  const pnlValue = subgraphSharePrice !== null ? formatPnLPct(subgraphSharePrice) : "--";
  const pnlSinceSubtext = formatPnlSinceSubtext(subgraphCreatedAt);

  const metricsData = [
    { label: "TVL", value: formatUSDC(tvl), icon: Landmark, testId: "metric-tvl" },
    { label: "Share Price", value: formatPrice(basketInfo?.sharePrice ?? 0n), icon: Coins, testId: "metric-share-price" },
    { label: "APY (7d)", value: formatApy(apy7d), pnl: apy7d !== null, sign: apySign, icon: TrendingUp, testId: "metric-apy" },
    { label: "PnL", value: pnlValue, pnl: subgraphSharePrice !== null, sign: pnlSign, icon: TrendingUp, testId: "metric-pnl-pct" },
    { label: "Total Shares", value: basketInfo?.totalSupply ? (Number(basketInfo.totalSupply) / 1e6).toLocaleString() : "0", icon: Layers, testId: "metric-total-shares" },
    ...(hasPnLData
      ? [
          {
            label: "Net PnL",
            value: formatSignedUsdcAmount(netPnL),
            subtext: pnlSinceSubtext,
            pnl: true,
            sign: netPnlSign,
            icon: Activity,
            testId: "metric-net-pnl",
          },
          { label: "Unrealised", value: formatSignedUsdcAmount(unrealisedPnL), pnl: true, sign: unrealisedSign, icon: LineChart, testId: "metric-unrealised-pnl" },
        ]
      : []),
    ...(state?.registered
      ? [
          { label: "Open Interest", value: formatUsd1e30(state.openInterest), icon: Target, testId: "metric-open-interest" },
          {
            label: "Leverage",
            value: formatLeverageRatio(state.openInterest, state.depositedCapital),
            icon: Scale,
            testId: "metric-leverage",
          },
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
        <div className="order-6 lg:order-none lg:col-span-3 lg:col-start-1 lg:row-start-5">
          <VaultHistoryTable vault={vault} actionByTxHash={actionByTxHash} />
        </div>
      </div>
    </PageWrapper>
  );
}

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

const runMarkdownComponents: Components = {
  p: ({ children }) => (
    <p className="mt-2 text-xs leading-relaxed text-app-muted first:mt-0">
      {children}
    </p>
  ),
  h1: ({ children }) => (
    <h4 className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-app-text first:mt-0">
      {children}
    </h4>
  ),
  h2: ({ children }) => (
    <h4 className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-app-text first:mt-0">
      {children}
    </h4>
  ),
  h3: ({ children }) => (
    <h5 className="mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-app-text first:mt-0">
      {children}
    </h5>
  ),
  h4: ({ children }) => (
    <h6 className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-app-muted first:mt-0">
      {children}
    </h6>
  ),
  ul: ({ children }) => (
    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-app-muted">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-app-muted">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="leading-relaxed">
      {children}
    </li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-app-text">
      {children}
    </strong>
  ),
  code: ({ children }) => (
    <code className="rounded-sm border border-app-border bg-app-bg-subtle px-1 font-mono text-[11px] text-app-text">
      {children}
    </code>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      className="text-app-accent underline decoration-app-accent/40 underline-offset-2 hover:decoration-app-accent"
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel={href?.startsWith("http") ? "noreferrer" : undefined}
    >
      {children}
    </a>
  ),
};

function AiActivitySection({
  vault,
  agentMeta,
  className,
}: {
  vault: Address;
  agentMeta: NonNullable<ReturnType<typeof useAgentMetadata>["data"]>;
  className?: string;
}) {
  const [decisionsOpen, setDecisionsOpen] = useState(true);
  const config = useConfig();
  const { chainId } = useDeploymentTarget();
  const explorer = config.chains.find((c) => c.id === chainId)?.blockExplorers?.default?.url;
  const { data: oracleAssetMetaMap } = useOracleAssetMetaMap();

  const lastRunIso = agentMeta.latestRun?.finishedAt || agentMeta.lastRunAt;
  const lastRunSeconds = lastRunIso ? Math.floor(new Date(lastRunIso).getTime() / 1000) : null;
  const lastRunRelative = lastRunSeconds ? formatRelativeTime(lastRunSeconds) : null;

  const runs = useMemo(
    () =>
      buildAgentRunGroups({
        recentRuns: agentMeta.recentRuns ?? [],
        latestRun: agentMeta.latestRun ?? null,
        recentActions: agentMeta.recentActions ?? [],
      }),
    [agentMeta.latestRun, agentMeta.recentActions, agentMeta.recentRuns],
  );
  const totalActions = runs.reduce((sum, run) => sum + run.actions.length, 0);
  const latestRunId = agentMeta.latestRun?.runId ?? null;

  const signalSourceLabel = agentMeta.signalSource
    ? SIGNAL_SOURCE_LABEL[agentMeta.signalSource] ?? agentMeta.signalSource
    : null;
  const entryModeLabel = agentMeta.entryMode
    ? ENTRY_MODE_LABEL[agentMeta.entryMode] ?? agentMeta.entryMode
    : null;

  return (
    <Card
      className={`border-app-accent/20 bg-app-accent/5 p-4 ${className ?? ""}`}
      data-testid={`ai-activity-${vault}`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-app-accent/25 bg-app-accent/10 text-app-accent">
            <Bot className="h-3.5 w-3.5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="text-sm font-semibold text-app-text">AI Operator</h3>
              <InfoTooltipLazy tooltipKey="aiOperator" ariaLabel="About AI Operator" />
              {signalSourceLabel && (
                <span className="inline-flex items-center gap-1 rounded-full border border-app-accent/25 bg-app-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-app-accent">
                  <Brain className="h-3 w-3" />
                  {signalSourceLabel}
                </span>
              )}
              {entryModeLabel && (
                <span className="inline-flex items-center gap-1 rounded-full border border-app-border bg-app-bg-subtle px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted">
                  <Sparkles className="h-3 w-3" />
                  {entryModeLabel}
                </span>
              )}
            </div>
            {agentMeta.agentName && (
              <p className="mt-1 text-[11px] text-app-muted">
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
      <VaultThesisCard
        className="mt-4"
        thesis={agentMeta.thesis}
        signalSource={agentMeta.signalSource}
        entryMode={agentMeta.entryMode}
        lastRunAt={lastRunIso ?? null}
        agentName={agentMeta.agentName}
        agentDescription={agentMeta.agentDescription}
        latestRun={agentMeta.latestRun}
        recentActions={agentMeta.recentActions ?? []}
        assetMetaMap={oracleAssetMetaMap}
      />


      {/* AI decisions */}
      {runs.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs font-semibold text-app-accent hover:underline"
            onClick={() => setDecisionsOpen((v) => !v)}
            aria-expanded={decisionsOpen}
            aria-controls="ai-all-decisions"
          >
            {decisionsOpen ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            <span>
              {decisionsOpen ? "Hide AI decisions" : "Show AI decisions"}
            </span>
            <span className="font-mono text-[10px] text-app-muted">
              ({totalActions} actions · {runs.length} run{runs.length === 1 ? "" : "s"})
            </span>
          </button>
          {decisionsOpen && (
            <div
              id="ai-all-decisions"
              className="mt-3 max-h-[40rem] space-y-3 overflow-y-auto pr-1"
            >
              {runs.map((run, idx) => (
                <RunGroupCard
                  key={`${run.runId}-${idx}`}
                  run={run}
                  index={runs.length - idx}
                  totalRuns={runs.length}
                  explorer={explorer}
                  isLatestRun={!!latestRunId && run.runId === latestRunId}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function RunGroupCard({
  run,
  index,
  totalRuns,
  explorer,
  isLatestRun,
}: {
  run: AgentRunGroup;
  index: number;
  totalRuns: number;
  explorer?: string;
  isLatestRun: boolean;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const ts = run.finishedAtIso
    ? Math.floor(new Date(run.finishedAtIso).getTime() / 1000)
    : null;
  const rel = ts ? formatRelativeTime(ts) : null;
  const onChain = run.actions.filter((a) => !!a.txHash).length;
  const offChain = run.actions.length - onChain;
  const toolCalls = run.run?.toolCalls ?? [];
  const summary = (run.run?.summary ?? "").trim();
  const reasoningSummaries = run.run?.reasoningSummaries ?? [];
  const errors = run.run?.errors ?? [];
  const softFailures = run.run?.softFailures ?? [];
  const riskOfficerVerdicts = run.run?.riskOfficerVerdicts ?? [];
  const confirmationBatches = run.run?.confirmationBatches ?? [];
  const hasVerboseDetails =
    !!summary ||
    reasoningSummaries.length > 0 ||
    toolCalls.length > 0 ||
    errors.length > 0 ||
    softFailures.length > 0 ||
    riskOfficerVerdicts.length > 0 ||
    confirmationBatches.length > 0;

  return (
    <section className="rounded-lg border border-app-border bg-app-surface/60 p-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md border border-app-accent/25 bg-app-accent/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-app-accent">
            <Activity className="h-3 w-3" />
            Run {index} of {totalRuns}
          </span>
          {isLatestRun && (
            <span className="inline-flex items-center gap-1 rounded-md border border-app-success/25 bg-app-success/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-app-success">
              Latest
            </span>
          )}
          {rel && (
            <span className="inline-flex items-center gap-1 text-[11px] text-app-muted">
              <Clock3 className="h-3 w-3" />
              {rel}
            </span>
          )}
          {run.run?.model && (
            <span className="inline-flex items-center gap-1 rounded-full border border-app-border bg-app-bg-subtle px-1.5 py-0.5 font-mono text-[10px] text-app-muted">
              {run.run.model}
            </span>
          )}
          {typeof run.run?.turns === "number" && run.run.turns > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-app-border bg-app-bg-subtle px-1.5 py-0.5 text-[10px] text-app-muted">
              {run.run.turns} turn{run.run.turns === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted">
          <span>
            {run.actions.length} action{run.actions.length === 1 ? "" : "s"}
          </span>
          {onChain > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-app-accent/20 bg-app-accent/10 px-1.5 py-0.5 text-app-accent">
              <ExternalLink className="h-2.5 w-2.5" />
              {onChain} on-chain
            </span>
          )}
          {offChain > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-app-border bg-app-bg-subtle px-1.5 py-0.5">
              <CircleSlash className="h-2.5 w-2.5" />
              {offChain} off-chain
            </span>
          )}
        </div>
      </header>
      {summary && (
        <ExpandableMarkdownSummary
          markdown={summary}
          expanded={summaryOpen}
          onToggle={() => setSummaryOpen((v) => !v)}
        />
      )}
      {toolCalls.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {toolCalls.slice(0, 8).map((tool, i) => (
            <span
              key={`${tool}-${i}`}
              className="inline-flex rounded-full border border-app-border bg-app-bg-subtle px-2 py-0.5 font-mono text-[10px] text-app-muted"
            >
              {tool}
            </span>
          ))}
          {toolCalls.length > 8 && (
            <span className="inline-flex rounded-full border border-app-border bg-app-bg-subtle px-2 py-0.5 font-mono text-[10px] text-app-muted">
              +{toolCalls.length - 8} more
            </span>
          )}
        </div>
      )}
      {run.actions.length > 0 ? (
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {run.actions.map((action, i) => (
            <ActionCard
              key={`${action.txHash ?? "no-tx"}-${i}`}
              action={action}
              explorer={explorer}
            />
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-app-border bg-app-bg-subtle p-3 text-xs text-app-muted">
          <div className="flex items-center gap-2 font-semibold text-app-text">
            <CircleSlash className="h-3.5 w-3.5" />
            No actions executed
          </div>
          <p className="mt-1 leading-relaxed">
            This run completed without write actions. Review the summary and
            tool-call trace for the decision context.
          </p>
        </div>
      )}
      {hasVerboseDetails && (
        <div className="mt-3">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-app-accent hover:underline"
            onClick={() => setDetailsOpen((v) => !v)}
            aria-expanded={detailsOpen}
          >
            {detailsOpen ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            {detailsOpen ? "Hide run details" : "Show run details"}
          </button>
          {detailsOpen && (
            <RunDetails
              summary={summary}
              reasoningSummaries={reasoningSummaries}
              toolCalls={toolCalls}
              errors={errors}
              softFailures={softFailures}
              riskOfficerVerdicts={riskOfficerVerdicts}
              confirmationBatches={confirmationBatches}
            />
          )}
        </div>
      )}
    </section>
  );
}

function JsonDetailList({
  title,
  items,
}: {
  title: string;
  items: Record<string, unknown>[];
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted">
        {title}
      </p>
      <div className="mt-1 space-y-1">
        {items.map((item, i) => (
          <pre
            key={`${title}-${i}`}
            className="overflow-x-auto rounded-md border border-app-border bg-app-bg-subtle p-2 font-mono text-[10px] leading-relaxed text-app-muted"
          >
            {JSON.stringify(item, null, 2)}
          </pre>
        ))}
      </div>
    </div>
  );
}

function MarkdownSummary({ markdown }: { markdown: string }) {
  return (
    <div className="prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={runMarkdownComponents}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function ExpandableMarkdownSummary({
  markdown,
  expanded,
  onToggle,
}: {
  markdown: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const shouldClamp = markdown.length > 360 || markdown.split(/\r?\n/).length > 6;
  return (
    <div className="mt-2">
      <div
        className={
          shouldClamp && !expanded
            ? "relative max-h-32 overflow-hidden"
            : undefined
        }
      >
        <MarkdownSummary markdown={markdown} />
        {shouldClamp && !expanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-app-surface/95 to-transparent" />
        )}
      </div>
      {shouldClamp && (
        <button
          type="button"
          className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-app-accent hover:underline"
          onClick={onToggle}
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function RunDetails({
  summary,
  reasoningSummaries,
  toolCalls,
  errors,
  softFailures,
  riskOfficerVerdicts,
  confirmationBatches,
}: {
  summary: string;
  reasoningSummaries: string[];
  toolCalls: string[];
  errors: Record<string, unknown>[];
  softFailures: Record<string, unknown>[];
  riskOfficerVerdicts: Record<string, unknown>[];
  confirmationBatches: Record<string, unknown>[];
}) {
  return (
    <div className="mt-2 space-y-3 rounded-md border border-app-border bg-app-surface p-3">
      {summary && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted">
            Final summary
          </p>
          <div className="mt-1">
            <MarkdownSummary markdown={summary} />
          </div>
        </div>
      )}
      {reasoningSummaries.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted">
            Reasoning summaries
          </p>
          <div className="mt-1 space-y-2">
            {reasoningSummaries.map((reasoning, i) => (
              <p
                key={`reasoning-${i}`}
                className="whitespace-pre-wrap rounded-md border border-app-border bg-app-bg-subtle p-2 text-xs leading-relaxed text-app-muted"
              >
                {reasoning}
              </p>
            ))}
          </div>
        </div>
      )}
      {toolCalls.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted">
            Tool-call trace
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-app-muted">
            {toolCalls.join(" → ")}
          </p>
        </div>
      )}
      <JsonDetailList title="Errors" items={errors} />
      <JsonDetailList title="Soft failures" items={softFailures} />
      <JsonDetailList title="Risk officer verdicts" items={riskOfficerVerdicts} />
      <JsonDetailList title="Confirmation batches" items={confirmationBatches} />
    </div>
  );
}

function ActionCard({
  action,
  explorer,
}: {
  action: AgentAction;
  explorer?: string;
}) {
  const meta = getActionMeta(action.tool, action.params);
  const chips = renderActionChips(action);
  const txHref = explorer && action.txHash ? `${explorer}/tx/${action.txHash}` : null;
  const onChain = !!action.txHash;

  return (
    <article className="flex h-full flex-col rounded-md border border-app-border bg-app-surface p-3 transition-colors hover:border-app-accent/30">
      <div className="flex items-start gap-2.5">
        <span
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${getToneTileClass(meta.tone)}`}
          aria-hidden
        >
          <meta.icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-app-text">
              {meta.label}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${
                onChain
                  ? "border border-app-accent/25 bg-app-accent/10 text-app-accent"
                  : "border border-app-border bg-app-bg-subtle text-app-muted"
              }`}
            >
              {onChain ? (
                <>
                  <ExternalLink className="h-2.5 w-2.5" />
                  On-chain
                </>
              ) : (
                <>
                  <CircleSlash className="h-2.5 w-2.5" />
                  Off-chain
                </>
              )}
            </span>
          </div>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-app-muted">
            {humanizeToolName(action.tool)}
          </p>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {chips.map((chip, i) => (
            <span
              key={`${chip.label}-${i}`}
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${
                chip.tone
                  ? getToneChipClass(chip.tone)
                  : "border-app-border bg-app-bg-subtle text-app-muted"
              } ${chip.mono ? "font-mono" : ""}`}
            >
              {chip.label}
            </span>
          ))}
        </div>
      )}

      {action.justification && (
        <p className="mt-2 line-clamp-3 text-xs italic leading-relaxed text-app-muted">
          {action.justification}
        </p>
      )}

      <div className="mt-auto pt-2">
        {txHref ? (
          <a
            className="inline-flex items-center gap-1 font-mono text-[11px] text-app-accent hover:underline"
            href={txHref}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="h-3 w-3" />
            View tx · {`${action.txHash!.slice(0, 6)}…${action.txHash!.slice(-4)}`}
          </a>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] text-app-muted">
            <CircleSlash className="h-3 w-3" />
            No on-chain effect
          </span>
        )}
      </div>
    </article>
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
