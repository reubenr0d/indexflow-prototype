"use client";

import { use, useState, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoLabel } from "@/components/ui/info-tooltip";
import { PerpCompositionRow } from "@/components/baskets/perp-composition-row";
import { SetAssetsCard } from "@/components/baskets/admin/set-assets-card";
import { PerpAllocationCard } from "@/components/baskets/admin/perp-allocation-card";
import { MaxPerpAllocationCard } from "@/components/baskets/admin/max-perp-allocation-card";
import { FeeCollectionCard } from "@/components/baskets/admin/fee-collection-card";
import { ReservePolicyCard } from "@/components/baskets/admin/reserve-policy-card";
import { ReserveTopUpCard } from "@/components/baskets/admin/reserve-topup-card";
import { BasketPositionManagerCard } from "@/components/baskets/admin/position-manager-card";
import { useBasketInfo, useVaultState } from "@/hooks/usePerpReader";
import { useBasketDetailQuery } from "@/hooks/subgraph/useSubgraphQueries";
import {
  useBasketFees,
  useMinReserveBps,
  useRequiredReserveUsdc,
  useAvailableForPerpUsdc,
  useCollectedFees,
  useBasketAssets,
} from "@/hooks/useBasketVault";
import { useOracleAssetMetaMap } from "@/hooks/useOracle";
import { useReadContracts } from "wagmi";
import { OracleAdapterABI, VaultAccountingABI } from "@/abi/contracts";
import {
  formatUSDC,
  formatBps,
  formatAssetId,
  formatAddress,
  formatPrice,
  formatRelativeTime,
  formatUsd1e30,
  formatSignedUsd1e30,
} from "@/lib/format";
import { computeBlendedComposition, type PerpExposureAsset } from "@/lib/blendedComposition";
import { showToast } from "@/components/ui/toast";
import { encodePacked, keccak256, type Address } from "viem";
import { getContracts } from "@/config/contracts";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { REFETCH_INTERVAL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("mb-10", className)}>
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-app-muted">{title}</h2>
      {children}
    </section>
  );
}

export default function AdminBasketDetailPage({ params }: { params: Promise<{ address: string }> }) {
  const { address: vaultAddress } = use(params);
  const vault = vaultAddress as Address;

  const { data: info } = useBasketInfo(vault);
  const { data: vaultState } = useVaultState(vault);
  const { depositFee, redeemFee } = useBasketFees(vault);
  const { data: minReserveBps } = useMinReserveBps(vault);
  const { data: requiredReserveUsdc } = useRequiredReserveUsdc(vault);
  const { data: availableForPerpUsdc } = useAvailableForPerpUsdc(vault);
  const { data: collectedFees } = useCollectedFees(vault);
  const {
    data: onchainBasketAssets,
    isLoading: isOnchainAssetsLoading,
    isFetching: isOnchainAssetsFetching,
  } = useBasketAssets(vault);
  const { data: assetMeta } = useOracleAssetMetaMap();
  const { chainId } = useDeploymentTarget();
  const { usdc, oracleAdapter, vaultAccounting } = getContracts(chainId);

  const [opsExpanded, setOpsExpanded] = useState(true);

  const basketInfo = info as {
    name: string;
    usdcBalance: bigint;
    perpAllocated: bigint;
    totalSupply: bigint;
    assetCount: bigint;
  } | undefined;

  const state = vaultState as {
    depositedCapital: bigint;
    realisedPnL: bigint;
    openInterest: bigint;
    collateralLocked: bigint;
    positionCount: bigint;
    registered: boolean;
  } | undefined;

  const tvl = (basketInfo?.usdcBalance ?? 0n) + (basketInfo?.perpAllocated ?? 0n);
  const idleUsdc = (basketInfo?.usdcBalance ?? 0n) - ((collectedFees as bigint | undefined) ?? 0n);
  const requiredReserve = (requiredReserveUsdc as bigint | undefined) ?? 0n;
  const availableForPerp = (availableForPerpUsdc as bigint | undefined) ?? 0n;
  const reserveHealthy = idleUsdc >= requiredReserve;

  const basketDetail = useBasketDetailQuery(vault, 1, 0);
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

  return (
    <PageWrapper>
      {/* Breadcrumb */}
      <div className="mb-2 flex items-center gap-1.5 text-sm text-app-muted">
        <Link href="/admin/baskets" className="inline-flex items-center gap-1 transition-colors hover:text-app-text">
          <ChevronLeft className="h-3.5 w-3.5" />
          Baskets
        </Link>
        <span>/</span>
        <span className="text-app-text">{basketInfo?.name || "Basket"}</span>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-app-text">
          {basketInfo?.name || "Basket"}
        </h1>
        <button
          className="mt-1 font-mono text-sm text-app-muted transition-colors hover:text-app-text"
          title="Copy full address"
          onClick={() => {
            navigator.clipboard.writeText(vault);
            showToast("success", "Address copied");
          }}
        >
          {formatAddress(vault)}
        </button>
      </div>

      {/* Overview */}
      <Section title="Overview">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="TVL" value={formatUSDC(tvl)} tooltipKey="tvl" />
          <StatCard label="Perp Allocated" value={formatUSDC(basketInfo?.perpAllocated ?? 0n)} tooltipKey="perpAllocated" />
          <StatCard label="Deposit Fee" value={depositFee !== undefined ? formatBps(depositFee) : "--"} tooltipKey="depositFee" />
          <StatCard label="Redeem Fee" value={redeemFee !== undefined ? formatBps(redeemFee) : "--"} tooltipKey="redeemFee" />
        </div>
      </Section>

      {/* Reserves */}
      <Section title="Reserves">
        <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Reserve Target" value={formatBps((minReserveBps as bigint | undefined) ?? 0n)} tooltipKey="reserveTarget" />
          <StatCard label="Required Reserve" value={formatUSDC(requiredReserve)} tooltipKey="requiredReserve" />
          <StatCard label="Idle USDC (ex fees)" value={formatUSDC(idleUsdc > 0n ? idleUsdc : 0n)} tooltipKey="idleUsdcExFees" />
          <StatCard label="Available For Perp" value={formatUSDC(availableForPerp)} tooltipKey="availableForPerp" />
        </div>
        <div className={cn(
          "flex items-center gap-3 rounded-lg border px-4 py-3",
          reserveHealthy
            ? "border-app-success/30 bg-app-success/5 text-app-success"
            : "border-app-danger/30 bg-app-danger/5 text-app-danger"
        )}>
          {reserveHealthy
            ? <CheckCircle2 className="h-5 w-5 shrink-0" />
            : <AlertTriangle className="h-5 w-5 shrink-0" />}
          <div>
            <p className="text-sm font-semibold">{reserveHealthy ? "Reserve Healthy" : "Reserve Below Target"}</p>
            <p className="text-xs opacity-80">
              {formatUSDC(idleUsdc > 0n ? idleUsdc : 0n)} idle / {formatUSDC(requiredReserve)} required
            </p>
          </div>
        </div>
      </Section>

      {/* Accounting (conditional) */}
      {state?.registered && (
        <Section title="Accounting">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Deposited Capital" value={formatUSDC(state.depositedCapital)} tooltipKey="depositedCapital" />
            <StatCard label="Realised PnL" value={formatSignedUsd1e30(state.realisedPnL)} tooltipKey="realisedPnl" />
            <StatCard label="Open Interest" value={formatUsd1e30(state.openInterest)} tooltipKey="openInterest" />
            <StatCard label="Positions" value={String(state.positionCount)} tooltipKey="positions" />
          </div>
        </Section>
      )}

      {/* Composition */}
      <Section title="Composition">
        <Card>
          <div className="min-h-[280px] divide-y divide-app-border">
            {compositionNote && (
              <div className="px-6 py-3 text-sm text-app-muted">{compositionNote}</div>
            )}
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
                ? blended.assetBlend.map((a) => {
                    const meta = assetMeta.get(a.assetId);
                    return (
                      <PerpCompositionRow
                        key={a.assetId}
                        assetName={meta?.name ?? formatAssetId(a.assetId)}
                        assetAddressLabel={meta?.address ? formatAddress(meta.address) : formatAssetId(a.assetId)}
                        netSize1e30={a.netSize}
                        longSize1e30={a.longSize}
                        shortSize1e30={a.shortSize}
                        blendBps={a.blendBps}
                      />
                    );
                  })
                : hasListedAssets
                  ? configuredAssetIds.map((assetId) => {
                      const meta = assetMeta.get(assetId);
                      const priceRow = configuredAssetPriceById.get(assetId);
                      const updatedTs = Number(priceRow?.timestamp ?? 0n);
                      return (
                        <div key={assetId} className="flex items-center justify-between px-6 py-4">
                          <div>
                            <p className="font-medium text-app-text">
                              {meta?.name ?? formatAssetId(assetId)}
                            </p>
                            <p className="font-mono text-xs text-app-muted">
                              {meta?.address ? formatAddress(meta.address) : formatAssetId(assetId)}
                            </p>
                            <p className="text-xs text-app-muted">
                              Price: {formatPrice(priceRow?.price ?? 0n)} · Updated:{" "}
                              {updatedTs > 0 ? formatRelativeTime(updatedTs) : "--"}
                            </p>
                          </div>
                          <div className="w-36">
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-app-bg-subtle">
                              <div className="h-full rounded-full bg-app-accent" style={{ width: "0%" }} />
                            </div>
                            <p className="mt-1 text-right text-xs text-app-muted">{formatBps(0n)}</p>
                          </div>
                        </div>
                      );
                    })
                  : (
                    <div className="flex items-center justify-between px-6 py-4">
                      <div>
                        <p className="font-medium text-app-text">--</p>
                        <p className="font-mono text-xs text-app-muted">--</p>
                        <p className="text-xs text-app-muted">Price: -- · Updated: --</p>
                      </div>
                      <div className="w-36">
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
                  <InfoLabel label="Perp Exposure" tooltipKey="perpExposure" />
                </p>
                <p className="text-xs text-app-muted">Open interest sleeve</p>
              </div>
              <span className="text-sm text-app-text">{formatBps(showAllocatedComposition ? blended.perpBlendBps : 0n)}</span>
            </div>
          </div>
        </Card>
      </Section>

      {/* Operations (collapsible) */}
      <section className="mb-10">
        <button
          onClick={() => setOpsExpanded(!opsExpanded)}
          className="mb-4 flex w-full items-center justify-between"
        >
          <h2 className="text-xs font-semibold uppercase tracking-widest text-app-muted">Operations</h2>
          {opsExpanded
            ? <ChevronUp className="h-4 w-4 text-app-muted" />
            : <ChevronDown className="h-4 w-4 text-app-muted" />}
        </button>
        <AnimatePresence initial={false}>
          {opsExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="grid gap-6 lg:grid-cols-3">
                <SetAssetsCard vault={vault} />
                <PerpAllocationCard
                  vault={vault}
                  currentAllocation={basketInfo?.perpAllocated ?? 0n}
                  availableToDeposit={availableForPerp}
                />
                <MaxPerpAllocationCard vault={vault} />
              </div>
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <ReservePolicyCard vault={vault} />
                <ReserveTopUpCard vault={vault} usdc={usdc} />
              </div>
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <FeeCollectionCard vault={vault} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Position Management */}
      <Section title="Position Management">
        <BasketPositionManagerCard vault={vault} />
      </Section>
    </PageWrapper>
  );
}
