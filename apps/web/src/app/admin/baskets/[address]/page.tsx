"use client";

import { use, useState } from "react";
import Link from "next/link";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { SharePriceChart } from "@/components/baskets/share-price-chart";
import { MetricsStrip } from "@/components/baskets/metrics-strip";
import { AssetPricePanel } from "@/components/baskets/asset-price-panel";
import { PositionsTable } from "@/components/baskets/positions-table";
import { CompositionSidebar } from "@/components/baskets/composition-sidebar";
import { SetAssetsCard } from "@/components/baskets/admin/set-assets-card";
import { PerpAllocationCard } from "@/components/baskets/admin/perp-allocation-card";
import { MaxPerpAllocationCard } from "@/components/baskets/admin/max-perp-allocation-card";
import { FeeCollectionCard } from "@/components/baskets/admin/fee-collection-card";
import { ReservePolicyCard } from "@/components/baskets/admin/reserve-policy-card";
import { ReserveTopUpCard } from "@/components/baskets/admin/reserve-topup-card";
import { BasketPositionManagerCard } from "@/components/baskets/admin/position-manager-card";
import { useBasketDashboardData } from "@/hooks/useBasketDashboardData";
import {
  formatUSDC,
  formatBps,
  formatAddress,
  formatUsd1e30,
  formatSignedUsd1e30,
} from "@/lib/format";
import { formatApy } from "@/lib/apy";
import { showToast } from "@/components/ui/toast";
import { type Address } from "viem";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronDown, ChevronUp } from "lucide-react";

export default function AdminBasketDetailPage({ params }: { params: Promise<{ address: string }> }) {
  const { address: vaultAddress } = use(params);
  const vault = vaultAddress as Address;

  const {
    basketInfo,
    state,
    tvl,
    idleUsdc,
    requiredReserve,
    availableForPerp,
    reserveHealthy,
    collectedFeesUsdc,
    depositFee,
    redeemFee,
    minReserveBps,
    unrealisedPnL,
    netPnL,
    capitalUtilPct,
    leverageRatio,
    configuredAssetIds,
    blended,
    showAllocatedComposition,
    assetMeta,
    apy7d,
    usdc,
  } = useBasketDashboardData(vault);

  const [opsExpanded, setOpsExpanded] = useState(false);
  const [tradeExpanded, setTradeExpanded] = useState(true);

  // ---- Metrics strip data ----

  const netPnlSign = netPnL > 0n ? 1 : netPnL < 0n ? -1 : 0;
  const unrealisedSign = unrealisedPnL > 0n ? 1 : unrealisedPnL < 0n ? -1 : 0;

  const apySign = apy7d !== null ? (apy7d > 0 ? 1 : apy7d < 0 ? -1 : 0) : 0;

  const metricsData = [
    { label: "TVL", value: formatUSDC(tvl) },
    { label: "APY (7d)", value: formatApy(apy7d), pnl: apy7d !== null, sign: apySign },
    { label: "Perp Allocated", value: formatUSDC(basketInfo?.perpAllocated ?? 0n) },
    ...(state?.registered
      ? [
          { label: "Open Interest", value: formatUsd1e30(state.openInterest) },
          { label: "Net PnL", value: formatSignedUsd1e30(netPnL), pnl: true, sign: netPnlSign },
          { label: "Unrealised", value: formatSignedUsd1e30(unrealisedPnL), pnl: true, sign: unrealisedSign },
          { label: "Leverage", value: `${leverageRatio.toFixed(2)}x` },
          { label: "Capital Util", value: `${capitalUtilPct.toFixed(1)}%` },
          { label: "Positions", value: String(state.positionCount) },
        ]
      : []),
    { label: "Dep Fee", value: depositFee !== undefined ? formatBps(depositFee) : "--" },
    { label: "Red Fee", value: redeemFee !== undefined ? formatBps(redeemFee) : "--" },
    { label: "Avail Perp", value: formatUSDC(availableForPerp) },
    { label: "Reserve", value: formatBps(minReserveBps ?? 0n) },
  ];

  return (
    <PageWrapper>
      {/* Breadcrumb + Header */}
      <div className="mb-1 flex items-center gap-1.5 text-sm text-app-muted">
        <Link
          href="/admin/baskets"
          className="inline-flex items-center gap-1 transition-colors hover:text-app-text"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Baskets
        </Link>
        <span>/</span>
        <span className="text-app-text">{basketInfo?.name || "Basket"}</span>
      </div>
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-app-text lg:text-3xl">
          {basketInfo?.name || "Basket"}
        </h1>
        <button
          className="font-mono text-xs text-app-muted transition-colors hover:text-app-text"
          title="Copy full address"
          onClick={() => {
            navigator.clipboard.writeText(vault);
            showToast("success", "Address copied");
          }}
        >
          {formatAddress(vault)}
        </button>
      </div>

      {/* ── Metrics strip ── */}
      <MetricsStrip metrics={metricsData} className="mb-6" />

      {/* ── Dashboard grid (flex column with responsive order) ── */}
      <div className="flex flex-col gap-6">
        {/* Positions -- order-1 on mobile (above fold), order-3 on desktop */}
        <div className="order-1 lg:order-3">
          <PositionsTable vault={vault} />
        </div>

        {/* Chart row -- order-2 on mobile, order-1 on desktop */}
        <div className="order-2 grid gap-6 lg:order-1 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <SharePriceChart vault={vault} />
          </div>
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

        {/* Asset price charts -- order-3 on mobile, order-2 on desktop */}
        <div className="order-3 lg:order-2">
          <AssetPricePanel assetIds={configuredAssetIds} />
        </div>

        {/* Trade panel -- order-4 on both */}
        <div className="order-4">
          <CollapsibleSection
            title="Trade"
            expanded={tradeExpanded}
            onToggle={() => setTradeExpanded((p) => !p)}
          >
            <BasketPositionManagerCard vault={vault} />
          </CollapsibleSection>
        </div>

        {/* Operations -- order-5 on both */}
        <div className="order-5">
          <CollapsibleSection
            title="Operations"
            expanded={opsExpanded}
            onToggle={() => setOpsExpanded((p) => !p)}
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
          </CollapsibleSection>
        </div>
      </div>
    </PageWrapper>
  );
}

function CollapsibleSection({
  title,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section>
      <button
        onClick={onToggle}
        className="mb-4 flex w-full items-center justify-between py-1"
      >
        <h2 className="text-xs font-semibold uppercase tracking-widest text-app-muted">
          {title}
        </h2>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-app-muted" />
        ) : (
          <ChevronDown className="h-4 w-4 text-app-muted" />
        )}
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
