"use client";

import { use, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoLabel } from "@/components/ui/info-tooltip";
import { DepositRedeemPanel } from "@/components/baskets/deposit-redeem-panel";
import { SharePriceChart } from "@/components/baskets/share-price-chart";
import { PerpCompositionRow } from "@/components/baskets/perp-composition-row";
import {
  ActivityBadge,
  BasketHistoryRow,
  MetricTile,
  SectionHeader,
  StatusChip,
  formatHistoryLabel,
  formatHistoryTime,
  getBasketActivityMeta,
  groupHistoryRowsByDay,
} from "@/components/baskets/basket-detail-ui";
import { useBasketInfo, useVaultPnL, useVaultState } from "@/hooks/usePerpReader";
import {
  useBasketFees,
  useMinReserveBps,
  useRequiredReserveUsdc,
  useAvailableForPerpUsdc,
  useCollectedFees,
  useBasketAssets,
} from "@/hooks/useBasketVault";
import { useOracleAssetMetaMap } from "@/hooks/useOracle";
import {
  type BasketActivityRow,
  useBasketActivitiesQuery,
  useBasketDetailQuery,
} from "@/hooks/subgraph/useSubgraphQueries";
import { useAccount, useConfig, usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { BasketShareTokenABI, OracleAdapterABI, VaultAccountingABI } from "@/abi/contracts";
import {
  formatUSDC,
  formatBps,
  formatAddress,
  formatAssetId,
  formatPrice,
  formatRelativeTime,
  formatSignedUsd1e30,
  formatUsd1e30,
} from "@/lib/format";
import { computeBlendedComposition, type PerpExposureAsset } from "@/lib/blendedComposition";
import { encodePacked, keccak256, type Address, parseAbiItem } from "viem";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock3,
  Coins,
  Copy,
  Gauge,
  Layers3,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { getContracts } from "@/config/contracts";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { REFETCH_INTERVAL } from "@/lib/constants";
import { showToast } from "@/components/ui/toast";

const HISTORY_PAGE_SIZE = 20;

export default function BasketDetailPage({ params }: { params: Promise<{ address: string }> }) {
  const { address: vaultAddress } = use(params);
  const vault = vaultAddress as Address;
  const { address: userAddress } = useAccount();
  const { chainId } = useDeploymentTarget();
  const { oracleAdapter, vaultAccounting } = getContracts(chainId);

  const { data: info, isLoading } = useBasketInfo(vault);
  const { data: vaultState } = useVaultState(vault);
  const { data: vaultPnL } = useVaultPnL(vault);
  const { depositFee, redeemFee } = useBasketFees(vault);
  const { data: minReserveBps } = useMinReserveBps(vault);
  const { data: requiredReserveUsdc } = useRequiredReserveUsdc(vault);
  const { data: availableForPerpUsdc } = useAvailableForPerpUsdc(vault);
  const { data: collectedFees } = useCollectedFees(vault);
  const { data: assetMeta } = useOracleAssetMetaMap();
  const {
    data: onchainBasketAssets,
    isLoading: isOnchainAssetsLoading,
    isFetching: isOnchainAssetsFetching,
  } = useBasketAssets(vault);

  const basketDetail = useBasketDetailQuery(vault, 1, 0);
  const [historySkip, setHistorySkip] = useState(0);
  const [showAdvancedMetrics, setShowAdvancedMetrics] = useState(false);
  const subgraphHistory = useBasketActivitiesQuery(vault, HISTORY_PAGE_SIZE, historySkip);
  const shouldUseHistoryRpcFallback =
    !subgraphHistory.isLoading &&
    (subgraphHistory.isError || !subgraphHistory.data || subgraphHistory.data.length === 0);
  const fallbackHistory = useVaultHistoryFallback(vault, shouldUseHistoryRpcFallback);

  const basketInfo = info as {
    vault: Address;
    shareToken: Address;
    name: string;
    basketPrice: bigint;
    sharePrice: bigint;
    totalSupply: bigint;
    usdcBalance: bigint;
    perpAllocated: bigint;
    assetCount: bigint;
  } | undefined;

  const state = vaultState as { openInterest: bigint } | undefined;
  const subgraphConfiguredAssetIds = (basketDetail.data?.basket?.assets ?? [])
    .filter((asset) => asset.active)
    .map((asset) => asset.assetId);
  const exposures = (basketDetail.data?.basket?.exposures ?? []) as PerpExposureAsset[];
  const onchainConfiguredAssetIds = useMemo(
    () =>
      (onchainBasketAssets ?? [])
        .map((entry) => entry.result as `0x${string}` | undefined)
        .filter((id): id is `0x${string}` => Boolean(id)),
    [onchainBasketAssets]
  );
  const configuredAssetIds = useMemo(
    () =>
      Array.from(
        new Set(
          (onchainConfiguredAssetIds.length > 0 ? onchainConfiguredAssetIds : subgraphConfiguredAssetIds).map((id) =>
            id.toLowerCase()
          )
        )
      ) as `0x${string}`[],
    [onchainConfiguredAssetIds, subgraphConfiguredAssetIds]
  );
  const isConfiguredAssetsLoading =
    (isOnchainAssetsLoading || isOnchainAssetsFetching) &&
    onchainConfiguredAssetIds.length === 0 &&
    subgraphConfiguredAssetIds.length === 0;
  const { data: configuredAssetPriceRows } = useReadContracts({
    contracts: configuredAssetIds.map((assetId) => ({
      address: oracleAdapter,
      abi: OracleAdapterABI,
      functionName: "getPrice" as const,
      args: [assetId] as const,
    })),
    query: {
      enabled: configuredAssetIds.length > 0,
      refetchInterval: REFETCH_INTERVAL,
    },
  });
  const configuredAssetPriceById = useMemo(() => {
    const m = new Map<`0x${string}`, { price: bigint; timestamp: bigint }>();
    configuredAssetIds.forEach((assetId, i) => {
      const row = configuredAssetPriceRows?.[i]?.result as [bigint, bigint] | undefined;
      m.set(assetId, {
        price: row?.[0] ?? 0n,
        timestamp: row?.[1] ?? 0n,
      });
    });
    return m;
  }, [configuredAssetIds, configuredAssetPriceRows]);

  const { data: shareBalance } = useReadContract({
    address: basketInfo?.shareToken,
    abi: BasketShareTokenABI,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress && !!basketInfo?.shareToken },
  });

  const tvl = basketInfo
    ? (basketInfo.usdcBalance ?? 0n) + (basketInfo.perpAllocated ?? 0n)
    : 0n;
  const idleUsdc = (basketInfo?.usdcBalance ?? 0n) - ((collectedFees as bigint | undefined) ?? 0n);
  const requiredReserve = (requiredReserveUsdc as bigint | undefined) ?? 0n;
  const availableForPerp = (availableForPerpUsdc as bigint | undefined) ?? 0n;
  const reserveHealthy = idleUsdc >= requiredReserve;

  const pnlResult = vaultPnL as [bigint, bigint] | undefined;
  const unrealisedPnL = pnlResult?.[0] ?? 0n;
  const realisedPnL = pnlResult?.[1] ?? 0n;
  const netPnL = unrealisedPnL + realisedPnL;
  const hasPnLData = pnlResult !== undefined;

  const positionTrackingKeys = useMemo(
    () =>
      configuredAssetIds.flatMap((assetId) => [
        {
          assetId,
          isLong: true,
          key: keccak256(encodePacked(["address", "bytes32", "bool"], [vault, assetId, true])),
        },
        {
          assetId,
          isLong: false,
          key: keccak256(encodePacked(["address", "bytes32", "bool"], [vault, assetId, false])),
        },
      ]),
    [configuredAssetIds, vault]
  );
  const { data: trackingRows } = useReadContracts({
    contracts: positionTrackingKeys.map((entry) => ({
      address: vaultAccounting,
      abi: VaultAccountingABI,
      functionName: "getPositionTracking" as const,
      args: [entry.key] as const,
    })),
    query: {
      enabled: positionTrackingKeys.length > 0,
      refetchInterval: REFETCH_INTERVAL,
    },
  });
  const onchainExposureRows = useMemo(() => {
    const byAsset = new Map<`0x${string}`, { longSize: bigint; shortSize: bigint }>();
    positionTrackingKeys.forEach((entry, i) => {
      const raw = trackingRows?.[i]?.result;
      if (!raw) return;

      const tracking = raw as
        | { size?: bigint; exists?: boolean }
        | [Address, `0x${string}`, boolean, bigint, bigint, bigint, bigint, bigint, boolean];
      const exists = Array.isArray(tracking) ? Boolean(tracking[8]) : Boolean(tracking.exists);
      const size = Array.isArray(tracking) ? (tracking[3] ?? 0n) : (tracking.size ?? 0n);
      const effectiveSize = exists ? size : 0n;

      const current = byAsset.get(entry.assetId) ?? { longSize: 0n, shortSize: 0n };
      byAsset.set(entry.assetId, {
        longSize: entry.isLong ? effectiveSize : current.longSize,
        shortSize: entry.isLong ? current.shortSize : effectiveSize,
      });
    });

    return Array.from(byAsset.entries())
      .map(([assetId, sizes]) => ({
        assetId,
        longSize: sizes.longSize,
        shortSize: sizes.shortSize,
        netSize: sizes.longSize - sizes.shortSize,
      }))
      .filter((row) => row.longSize > 0n || row.shortSize > 0n || row.netSize !== 0n) as PerpExposureAsset[];
  }, [positionTrackingKeys, trackingRows]);
  const subgraphHasLiveExposure = exposures.some(
    (row) => row.longSize > 0n || row.shortSize > 0n || row.netSize !== 0n
  );
  const effectiveExposures =
    subgraphHasLiveExposure || (exposures.length > 0 && onchainExposureRows.length === 0)
      ? exposures
      : onchainExposureRows;

  const blended = computeBlendedComposition(
    basketInfo?.usdcBalance ?? 0n,
    basketInfo?.perpAllocated ?? 0n,
    state?.openInterest ?? 0n,
    effectiveExposures
  );
  const hasListedAssets = configuredAssetIds.length > 0;
  const hasExposureRows = effectiveExposures.length > 0;
  const hasNonZeroAllocation = blended.assetBlend.some((asset) => asset.blendBps > 0n);
  const hasPerpActivitySignal =
    (state?.openInterest ?? 0n) > 0n ||
    (basketInfo?.perpAllocated ?? 0n) > 0n ||
    hasExposureRows;
  const showAllocatedComposition = hasExposureRows && hasNonZeroAllocation;
  const showAssetsAddedNoPerpActivity = hasListedAssets && !hasPerpActivitySignal;
  const showNoAssetsAllocatedYet =
    hasListedAssets && !showAllocatedComposition && !showAssetsAddedNoPerpActivity;
  const showNoAssetsListedYet = !hasListedAssets && !isConfiguredAssetsLoading;
  const compositionNote = showAssetsAddedNoPerpActivity
    ? "Assets are configured, but perp activity has not started yet."
    : showNoAssetsAllocatedYet
      ? "Assets are configured, but current composition allocation is 0.00%."
      : showNoAssetsListedYet
        ? "No assets listed yet. Add assets to enable per-asset composition tracking."
        : isConfiguredAssetsLoading
          ? "Syncing latest onchain asset configuration..."
          : null;

  const historyRows = useMemo(
    () =>
      ((subgraphHistory.data && subgraphHistory.data.length > 0 ? subgraphHistory.data : fallbackHistory.data) ??
        []) as BasketHistoryRow[],
    [subgraphHistory.data, fallbackHistory.data]
  );
  const canLoadMore = (subgraphHistory.data?.length ?? 0) === HISTORY_PAGE_SIZE && !shouldUseHistoryRpcFallback;
  const historyGroups = useMemo(() => groupHistoryRowsByDay(historyRows), [historyRows]);
  const recentActivityCount = historyRows.length;
  const latestActivityLabel = historyRows[0]?.timestamp ? formatRelativeTime(Number(historyRows[0].timestamp)) : "--";
  const latestActivityMeta = historyRows[0] ? getBasketActivityMeta(historyRows[0]) : undefined;

  const handleCopyShareToken = async () => {
    if (!basketInfo?.shareToken || typeof navigator === "undefined") return;
    try {
      await navigator.clipboard.writeText(basketInfo.shareToken);
      showToast("success", "Share token address copied");
    } catch {
      showToast("error", "Failed to copy share token address");
    }
  };

  if (isLoading) {
    return (
      <PageWrapper>
        <div className="grid gap-8 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <Skeleton className="mb-2 h-8 w-48" />
            <Skeleton className="mb-6 h-4 w-32" />
            <Skeleton className="mb-8 h-12 w-36" />
            <Skeleton className="h-64 w-full" />
          </div>
          <div className="lg:col-span-2">
            <Skeleton className="h-80 w-full rounded-2xl" />
          </div>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <div className="grid gap-8 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <Card className="overflow-hidden border border-app-border shadow-[var(--shadow)]">
              <div className="relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(13,148,136,0.12),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(12,74,110,0.08),transparent_42%)]" />
                <div className="relative flex flex-col gap-6 p-6 xl:flex-row xl:items-start xl:justify-between">
                  <div className="max-w-2xl">
                    <div className="inline-flex items-center rounded-full border border-app-border bg-app-bg-subtle px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">
                      Basket snapshot
                    </div>
                    <h1 className="mt-3 text-3xl font-semibold tracking-tight text-app-text">
                      {basketInfo?.name || "Basket"}
                    </h1>
                    <p className="mt-2 max-w-xl text-sm text-app-muted">
                      Capital, perp exposure, reserve health, and recent activity at a glance.
                    </p>
                    {basketInfo?.shareToken && (
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <span className="font-mono text-sm text-app-muted">{formatAddress(basketInfo.shareToken)}</span>
                        <button
                          type="button"
                          onClick={handleCopyShareToken}
                          className="inline-flex items-center gap-2 rounded-md border border-app-border bg-app-surface px-3 py-1.5 text-xs font-semibold text-app-text transition-colors hover:border-app-border-strong hover:bg-app-surface-hover"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copy
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 xl:justify-end">
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

              <div className="grid gap-3 border-t border-app-border bg-app-bg-subtle/60 p-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricTile
                  icon={Wallet}
                  label={<InfoLabel label="TVL" tooltipKey="tvl" />}
                  value={formatUSDC(tvl)}
                  subValue="Idle USDC plus perp-allocated capital"
                />
                <MetricTile
                  icon={TrendingUp}
                  label="Share price"
                  value={formatPrice(basketInfo?.sharePrice ?? 0n)}
                  subValue={latestActivityLabel !== "--" ? `Last update ${latestActivityLabel}` : "Live basket price"}
                />
                <MetricTile
                  icon={Coins}
                  label={<InfoLabel label="Total shares" tooltipKey="totalShares" />}
                  value={basketInfo?.totalSupply ? (Number(basketInfo.totalSupply) / 1e6).toLocaleString() : "0"}
                  subValue="Outstanding basket shares"
                />
                <MetricTile
                  icon={Activity}
                  label={<InfoLabel label="Recent activity" tooltipKey="vaultHistory" />}
                  value={recentActivityCount.toString()}
                  subValue={latestActivityMeta ? latestActivityMeta.title : "No indexed activity"}
                />
              </div>
              {hasPnLData && (
                <div className="grid gap-3 border-t border-app-border bg-app-bg-subtle/60 p-4 sm:grid-cols-3">
                  <MetricTile
                    icon={TrendingUp}
                    label={<InfoLabel label="Unrealised P&L" tooltipKey="unrealisedPnl" />}
                    value={formatSignedUsd1e30(unrealisedPnL)}
                    subValue="Mark-to-market on open positions"
                  />
                  <MetricTile
                    icon={Activity}
                    label={<InfoLabel label="Realised P&L" tooltipKey="realisedPnl" />}
                    value={formatSignedUsd1e30(realisedPnL)}
                    subValue="Locked in from closed positions"
                  />
                  <MetricTile
                    icon={Gauge}
                    label={<InfoLabel label="Net P&L" tooltipKey="netPnl" />}
                    value={formatSignedUsd1e30(netPnL)}
                    subValue="Total perp profit / loss"
                  />
                </div>
              )}
            </Card>
          </motion.div>

          <SharePriceChart vault={vault} />

          <Card className="p-5">
            <SectionHeader
              icon={Layers3}
              title={<InfoLabel label="Perp-Driven Composition" tooltipKey="perpDrivenComposition" />}
              meta="Current per-asset perp blend, net exposure, and sleeve allocation."
            />
            <div className="overflow-hidden rounded-xl border border-app-border">
              <div className="min-h-[280px] divide-y divide-app-border">
                {compositionNote && <div className="px-6 py-3 text-sm text-app-muted">{compositionNote}</div>}
                {isConfiguredAssetsLoading
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <div key={`comp-loading-${i}`} className="flex items-center justify-between px-6 py-4">
                        <div>
                          <Skeleton className="h-4 w-36" />
                          <Skeleton className="mt-2 h-3 w-24" />
                          <Skeleton className="mt-2 h-3 w-44" />
                        </div>
                        <div className="w-36">
                          <Skeleton className="h-1.5 w-full rounded-full" />
                          <Skeleton className="mt-2 ml-auto h-3 w-12" />
                        </div>
                      </div>
                    ))
                  : showAllocatedComposition
                    ? blended.assetBlend.map((asset) => {
                        const meta = assetMeta.get(asset.assetId);
                        return (
                          <PerpCompositionRow
                            key={asset.assetId}
                            assetName={meta?.name ?? formatAssetId(asset.assetId)}
                            assetAddressLabel={meta?.address ? formatAddress(meta.address) : formatAssetId(asset.assetId)}
                            netSize1e30={asset.netSize}
                            longSize1e30={asset.longSize}
                            shortSize1e30={asset.shortSize}
                            blendBps={asset.blendBps}
                          />
                        );
                      })
                    : hasListedAssets
                      ? configuredAssetIds.map((assetId) => {
                          const meta = assetMeta.get(assetId);
                          const priceRow = configuredAssetPriceById.get(assetId);
                          const updatedTs = Number(priceRow?.timestamp ?? 0n);
                          return (
                            <div key={assetId} className="flex items-center justify-between gap-4 px-6 py-4">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-app-accent shadow-[0_0_0_4px_rgba(13,148,136,0.12)]" />
                                  <p className="truncate font-medium text-app-text">
                                    {meta?.name ?? formatAssetId(assetId)}
                                  </p>
                                </div>
                                <p className="font-mono text-xs text-app-muted">
                                  {meta?.address ? formatAddress(meta.address) : formatAssetId(assetId)}
                                </p>
                                <p className="text-xs text-app-muted">
                                  Price: {formatPrice(priceRow?.price ?? 0n)} · Updated:{" "}
                                  {updatedTs > 0 ? formatRelativeTime(updatedTs) : "--"}
                                </p>
                              </div>
                              <div className="w-36 shrink-0">
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-app-bg-subtle">
                                  <div className="h-full rounded-full bg-app-accent" style={{ width: "0%" }} />
                                </div>
                                <p className="mt-1 text-right text-xs text-app-muted">{formatBps(0n)}</p>
                              </div>
                            </div>
                          );
                        })
                      : (
                        <div className="flex items-center justify-between gap-4 px-6 py-4">
                          <div>
                            <p className="font-medium text-app-text">--</p>
                            <p className="font-mono text-xs text-app-muted">--</p>
                            <p className="text-xs text-app-muted">Price: -- · Updated: --</p>
                          </div>
                          <div className="w-36 shrink-0">
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-app-bg-subtle">
                              <div className="h-full rounded-full bg-app-accent" style={{ width: "0%" }} />
                            </div>
                            <p className="mt-1 text-right text-xs text-app-muted">{formatBps(0n)}</p>
                          </div>
                        </div>
                      )}
                <div className="flex items-center justify-between px-6 py-4">
                  <div>
                    <p className="font-medium text-app-text">
                      <InfoLabel label="Aggregate Perp Exposure" tooltipKey="perpExposure" />
                    </p>
                    <p className="text-xs text-app-muted">Open interest sleeve</p>
                  </div>
                  <p className="text-sm text-app-text">
                    {formatBps(showAllocatedComposition ? blended.perpBlendBps : 0n)}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <SectionHeader
              icon={ShieldCheck}
              title="Advanced Metrics"
              meta="Collapsed by default to keep the page focused on the snapshot."
              action={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowAdvancedMetrics((open) => !open)}
                  aria-expanded={showAdvancedMetrics}
                  aria-controls="advanced-metrics-panel"
                >
                  {showAdvancedMetrics ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
                  {showAdvancedMetrics ? "Hide" : "Show"}
                </Button>
              }
            />
            {showAdvancedMetrics ? (
              <div id="advanced-metrics-panel" className="grid gap-3 sm:grid-cols-2">
                <MetricTile
                  icon={Gauge}
                  label={<InfoLabel label="Target Reserve" tooltipKey="targetReserve" />}
                  value={formatBps((minReserveBps as bigint | undefined) ?? 0n)}
                />
                <MetricTile
                  icon={Wallet}
                  label={<InfoLabel label="Required Reserve" tooltipKey="requiredReserve" />}
                  value={formatUSDC(requiredReserve)}
                />
                <MetricTile
                  icon={ArrowDownToLine}
                  label={<InfoLabel label="Idle USDC (ex fees)" tooltipKey="idleUsdcExFees" />}
                  value={formatUSDC(idleUsdc > 0n ? idleUsdc : 0n)}
                />
                <MetricTile
                  icon={ArrowUpFromLine}
                  label={<InfoLabel label="Available For Perp" tooltipKey="availableForPerp" />}
                  value={formatUSDC(availableForPerp)}
                />
                <MetricTile
                  icon={Coins}
                  label={<InfoLabel label="Deposit Fee" tooltipKey="depositFee" />}
                  value={depositFee !== undefined ? formatBps(depositFee) : "--"}
                />
                <MetricTile
                  icon={Coins}
                  label={<InfoLabel label="Redeem Fee" tooltipKey="redeemFee" />}
                  value={redeemFee !== undefined ? formatBps(redeemFee) : "--"}
                />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-app-border bg-app-bg-subtle/60 p-4 text-sm text-app-muted">
                Reserve policy, fee schedule, and perp headroom are available in the advanced panel.
              </div>
            )}
          </Card>

          <Card className="p-5">
            <SectionHeader
              icon={Clock3}
              title={<InfoLabel label="Vault History" tooltipKey="vaultHistory" />}
              meta={`${historyRows.length} shown across ${historyGroups.length} day bucket${historyGroups.length === 1 ? "" : "s"}`}
            />
            <div className="overflow-hidden rounded-xl border border-app-border">
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
                          <HistoryRowView key={row.id} row={row} />
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

        <div className="lg:col-span-2">
          <DepositRedeemPanel
            vault={vault}
            sharePrice={basketInfo?.sharePrice ?? 0n}
            depositFeeBps={depositFee ?? 0n}
            redeemFeeBps={redeemFee ?? 0n}
            shareBalance={shareBalance as bigint | undefined}
          />
        </div>
      </div>
    </PageWrapper>
  );
}

function useVaultHistoryFallback(vault: Address, enabled: boolean) {
  const { chainId } = useDeploymentTarget();
  const publicClient = usePublicClient({ chainId });
  const { vaultAccounting } = getContracts(chainId);

  return useQuery({
    queryKey: ["vault-history-rpc", chainId, vault],
    enabled: enabled && !!publicClient,
    queryFn: async (): Promise<BasketHistoryRow[]> => {
      if (!publicClient) return [];

      const [deposits, redeems, allocations, withdrawals, opens, closes, pnls] = await Promise.all([
        publicClient.getLogs({
          address: vault,
          event: parseAbiItem("event Deposited(address indexed user, uint256 usdcAmount, uint256 sharesMinted)"),
          fromBlock: 0n,
          toBlock: "latest",
        }),
        publicClient.getLogs({
          address: vault,
          event: parseAbiItem("event Redeemed(address indexed user, uint256 sharesBurned, uint256 usdcReturned)"),
          fromBlock: 0n,
          toBlock: "latest",
        }),
        publicClient.getLogs({
          address: vault,
          event: parseAbiItem("event AllocatedToPerp(uint256 amount)"),
          fromBlock: 0n,
          toBlock: "latest",
        }),
        publicClient.getLogs({
          address: vault,
          event: parseAbiItem("event WithdrawnFromPerp(uint256 amount)"),
          fromBlock: 0n,
          toBlock: "latest",
        }),
        publicClient.getLogs({
          address: vaultAccounting,
          event: parseAbiItem(
            "event PositionOpened(address indexed vault, bytes32 indexed asset, bool isLong, uint256 size, uint256 collateral)"
          ),
          args: { vault },
          fromBlock: 0n,
          toBlock: "latest",
        }),
        publicClient.getLogs({
          address: vaultAccounting,
          event: parseAbiItem(
            "event PositionClosed(address indexed vault, bytes32 indexed asset, bool isLong, int256 realisedPnL)"
          ),
          args: { vault },
          fromBlock: 0n,
          toBlock: "latest",
        }),
        publicClient.getLogs({
          address: vaultAccounting,
          event: parseAbiItem("event PnLRealized(address indexed vault, int256 amount)"),
          args: { vault },
          fromBlock: 0n,
          toBlock: "latest",
        }),
      ]);

      const rows: BasketHistoryRow[] = [];

      for (const l of deposits) {
        rows.push({
          id: `${l.transactionHash}-${l.logIndex}`,
          activityType: "deposit",
          timestamp: 0n,
          txHash: l.transactionHash,
          amountUsdc: l.args.usdcAmount,
        });
      }
      for (const l of redeems) {
        rows.push({
          id: `${l.transactionHash}-${l.logIndex}`,
          activityType: "redeem",
          timestamp: 0n,
          txHash: l.transactionHash,
          amountUsdc: l.args.usdcReturned,
        });
      }
      for (const l of allocations) {
        rows.push({
          id: `${l.transactionHash}-${l.logIndex}`,
          activityType: "allocateToPerp",
          timestamp: 0n,
          txHash: l.transactionHash,
          amountUsdc: l.args.amount,
        });
      }
      for (const l of withdrawals) {
        rows.push({
          id: `${l.transactionHash}-${l.logIndex}`,
          activityType: "withdrawFromPerp",
          timestamp: 0n,
          txHash: l.transactionHash,
          amountUsdc: l.args.amount,
        });
      }
      for (const l of opens) {
        rows.push({
          id: `${l.transactionHash}-${l.logIndex}`,
          activityType: "positionOpened",
          timestamp: 0n,
          txHash: l.transactionHash,
          size: l.args.size,
          amountUsdc: l.args.collateral,
          assetId: l.args.asset,
          isLong: l.args.isLong,
        });
      }
      for (const l of closes) {
        rows.push({
          id: `${l.transactionHash}-${l.logIndex}`,
          activityType: "positionClosed",
          timestamp: 0n,
          txHash: l.transactionHash,
          pnl: l.args.realisedPnL,
          assetId: l.args.asset,
          isLong: l.args.isLong,
        });
      }
      for (const l of pnls) {
        rows.push({
          id: `${l.transactionHash}-${l.logIndex}`,
          activityType: "pnlRealized",
          timestamp: 0n,
          txHash: l.transactionHash,
          pnl: l.args.amount,
        });
      }

      const blockNumbers = Array.from(new Set([...deposits, ...redeems, ...allocations, ...withdrawals, ...opens, ...closes, ...pnls].map((l) => l.blockNumber)));
      const blocks = await Promise.all(blockNumbers.map((blockNumber) => publicClient.getBlock({ blockNumber })));
      const tsByBlock = new Map(blocks.map((b) => [b.number, b.timestamp]));

      const logEntries = [
        ...deposits,
        ...redeems,
        ...allocations,
        ...withdrawals,
        ...opens,
        ...closes,
        ...pnls,
      ];

      for (const row of rows) {
        const log = logEntries.find((entry) => `${entry.transactionHash}-${entry.logIndex}` === row.id);
        if (log) {
          row.timestamp = tsByBlock.get(log.blockNumber) ?? 0n;
        }
      }

      rows.sort((a, b) => Number(b.timestamp - a.timestamp));
      return rows.slice(0, HISTORY_PAGE_SIZE);
    },
    staleTime: 15_000,
    retry: 1,
  });
}

function HistoryRowView({ row }: { row: BasketHistoryRow | BasketActivityRow }) {
  const config = useConfig();
  const { chainId } = useDeploymentTarget();
  const explorer = config.chains.find((c) => c.id === chainId)?.blockExplorers?.default?.url;
  const txHref = explorer ? `${explorer}/tx/${row.txHash}` : "#";
  const meta = getBasketActivityMeta(row);

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
