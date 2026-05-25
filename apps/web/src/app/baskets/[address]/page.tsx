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
import { VaultHistoryTable } from "@/components/baskets/vault-history-table";
import { VaultThesisCard } from "@/components/baskets/vault-thesis-card";
import {
  AiOperatorBadge,
  AtlasMlBadge,
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

  const metricsData = [
    { label: "TVL", value: formatUSDC(tvl), icon: Landmark, testId: "metric-tvl" },
    { label: "Share Price", value: formatPrice(basketInfo?.sharePrice ?? 0n), icon: Coins, testId: "metric-share-price" },
    { label: "APY (7d)", value: formatApy(apy7d), pnl: apy7d !== null, sign: apySign, icon: TrendingUp, testId: "metric-apy" },
    { label: "PnL", value: pnlValue, pnl: subgraphSharePrice !== null, sign: pnlSign, icon: TrendingUp, testId: "metric-pnl-pct" },
    { label: "Total Shares", value: basketInfo?.totalSupply ? (Number(basketInfo.totalSupply) / 1e6).toLocaleString() : "0", icon: Layers, testId: "metric-total-shares" },
    ...(hasPnLData
      ? [
          { label: "Net PnL", value: formatSignedUsdcAmount(netPnL), pnl: true, sign: netPnlSign, icon: Activity, testId: "metric-net-pnl" },
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
        <div className="order-6 lg:order-none lg:col-span-3 lg:col-start-1 lg:row-start-5">
          <VaultHistoryTable vault={vault} actionByTxHash={actionByTxHash} />
        </div>
      </div>
    </PageWrapper>
  );
}

type RunGroup = {
  runId: string;
  finishedAtIso: string | null;
  actions: AgentAction[];
};

function groupActionsByRun(actions: AgentAction[]): RunGroup[] {
  const order: string[] = [];
  const groups = new Map<string, RunGroup>();
  for (const action of actions) {
    const runId = action.runId ?? action.timestamp ?? "__unknown__";
    let group = groups.get(runId);
    if (!group) {
      group = {
        runId,
        finishedAtIso: action.timestamp ?? null,
        actions: [],
      };
      groups.set(runId, group);
      order.push(runId);
    }
    group.actions.push(action);
  }
  return order.map((id) => groups.get(id)!).filter(Boolean);
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

function AiActivitySection({
  vault,
  agentMeta,
  className,
}: {
  vault: Address;
  agentMeta: NonNullable<ReturnType<typeof useAgentMetadata>["data"]>;
  className?: string;
}) {
  const [decisionsOpen, setDecisionsOpen] = useState(false);
  const config = useConfig();
  const { chainId } = useDeploymentTarget();
  const explorer = config.chains.find((c) => c.id === chainId)?.blockExplorers?.default?.url;
  const { data: oracleAssetMetaMap } = useOracleAssetMetaMap();

  const lastRunIso = agentMeta.latestRun?.finishedAt || agentMeta.lastRunAt;
  const lastRunSeconds = lastRunIso ? Math.floor(new Date(lastRunIso).getTime() / 1000) : null;
  const lastRunRelative = lastRunSeconds ? formatRelativeTime(lastRunSeconds) : null;

  const runs = useMemo(
    () => groupActionsByRun(agentMeta.recentActions ?? []),
    [agentMeta.recentActions],
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


      {/* All decisions (collapsed by default) */}
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
              {decisionsOpen ? "Hide all decisions" : "Show all decisions"}
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
  run: RunGroup;
  index: number;
  totalRuns: number;
  explorer?: string;
  isLatestRun: boolean;
}) {
  const ts = run.finishedAtIso
    ? Math.floor(new Date(run.finishedAtIso).getTime() / 1000)
    : null;
  const rel = ts ? formatRelativeTime(ts) : null;
  const onChain = run.actions.filter((a) => !!a.txHash).length;
  const offChain = run.actions.length - onChain;

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
      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {run.actions.map((action, i) => (
          <ActionCard
            key={`${action.txHash ?? "no-tx"}-${i}`}
            action={action}
            explorer={explorer}
          />
        ))}
      </div>
    </section>
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
