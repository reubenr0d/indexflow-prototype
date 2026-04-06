"use client";

import { use, useState, useEffect, useMemo } from "react";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { InfoLabel } from "@/components/ui/info-tooltip";
import { useBasketInfo, useVaultState } from "@/hooks/usePerpReader";
import { useBasketDetailQuery } from "@/hooks/subgraph/useSubgraphQueries";
import {
  useBasketFees,
  useMaxPerpAllocation,
  useSetMaxPerpAllocation,
  useSetAssets,
  useMinReserveBps,
  useRequiredReserveUsdc,
  useAvailableForPerpUsdc,
  useCollectedFees,
  useSetMinReserveBps,
  useTopUpReserve,
  useUSDCAllowance,
  useApproveUSDC,
  useBasketAssets,
} from "@/hooks/useBasketVault";
import { useOracleAssetMetaMap, useSupportedOracleAssets } from "@/hooks/useOracle";
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useChainId, useReadContracts } from "wagmi";
import { BasketVaultABI, OracleAdapterABI } from "@/abi/contracts";
import { formatUSDC, formatBps, formatAssetId, formatAddress, formatPrice, formatRelativeTime } from "@/lib/format";
import { computeBlendedComposition, type PerpExposureAsset } from "@/lib/blendedComposition";
import { showToast } from "@/components/ui/toast";
import { type Address, type Hex } from "viem";
import { parseUSDCInput } from "@/lib/format";
import { getContracts } from "@/config/contracts";
import { REFETCH_INTERVAL } from "@/lib/constants";
import { useContractErrorToast } from "@/hooks/useContractErrorToast";
import { usePostTxRefresh } from "@/hooks/usePostTxRefresh";
import {
  useClosePosition,
  useMaxOpenInterest,
  useMaxPositionSize,
  useOpenPosition,
  usePositionTracking,
} from "@/hooks/useVaultAccounting";

function usdcToInputValue(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const frac = amount % 1_000_000n;
  if (frac === 0n) return whole.toString();
  return `${whole.toString()}.${frac.toString().padStart(6, "0").replace(/0+$/, "")}`;
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
  const chainId = useChainId();
  const { usdc, oracleAdapter } = getContracts(chainId);

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

  const blended = computeBlendedComposition(
    basketInfo?.usdcBalance ?? 0n,
    basketInfo?.perpAllocated ?? 0n,
    state?.openInterest ?? 0n,
    exposures
  );
  const hasListedAssets = configuredAssetIds.length > 0;
  const hasExposureRows = exposures.length > 0;
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

  return (
    <PageWrapper>
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-app-text">
          {basketInfo?.name || "Basket"}
        </h1>
        <p className="mt-1 font-mono text-sm text-app-muted">{formatAddress(vault)}</p>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="TVL" value={formatUSDC(tvl)} tooltipKey="tvl" />
        <StatCard label="Perp Allocated" value={formatUSDC(basketInfo?.perpAllocated ?? 0n)} tooltipKey="perpAllocated" />
        <StatCard label="Deposit Fee" value={depositFee !== undefined ? formatBps(depositFee) : "--"} tooltipKey="depositFee" />
        <StatCard label="Redeem Fee" value={redeemFee !== undefined ? formatBps(redeemFee) : "--"} tooltipKey="redeemFee" />
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Reserve Target" value={formatBps((minReserveBps as bigint | undefined) ?? 0n)} tooltipKey="reserveTarget" />
        <StatCard label="Required Reserve" value={formatUSDC(requiredReserve)} tooltipKey="requiredReserve" />
        <StatCard label="Idle USDC (ex fees)" value={formatUSDC(idleUsdc > 0n ? idleUsdc : 0n)} tooltipKey="idleUsdcExFees" />
        <StatCard label="Available For Perp" value={formatUSDC(availableForPerp)} tooltipKey="availableForPerp" />
      </div>
      <p className={`mb-8 text-sm font-medium ${reserveHealthy ? "text-app-success" : "text-app-danger"}`}>
        Reserve Health: {reserveHealthy ? "Healthy" : "Below Target"}
      </p>

      {state?.registered && (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Deposited Capital" value={formatUSDC(state.depositedCapital)} tooltipKey="depositedCapital" />
          <StatCard
            label="Realised PnL"
            value={formatUSDC(state.realisedPnL)}
            tooltipKey="realisedPnl"
          />
          <StatCard label="Open Interest" value={formatUSDC(state.openInterest)} tooltipKey="openInterest" />
          <StatCard label="Positions" value={String(state.positionCount)} tooltipKey="positions" />
        </div>
      )}

      {showAllocatedComposition ? (
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-app-text">
            <InfoLabel label="Perp-Driven Composition" tooltipKey="perpDrivenComposition" />
          </h2>
          <Card>
            <div className="divide-y divide-app-border">
              {blended.assetBlend.map((a) => {
                const meta = assetMeta.get(a.assetId);
                return (
                  <div key={a.assetId} className="flex items-center justify-between px-6 py-4">
                    <div>
                      <p className="font-medium text-app-text">
                        {meta?.name ?? formatAssetId(a.assetId)}
                      </p>
                      <p className="font-mono text-xs text-app-muted">
                        {meta?.address ? formatAddress(meta.address) : formatAssetId(a.assetId)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-app-text">{formatBps(a.blendBps)}</p>
                      <p className="text-xs text-app-muted">
                        Net {formatUSDC(a.netSize >= 0n ? a.netSize : -a.netSize)} {a.netSize >= 0n ? "Long" : "Short"}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between px-6 py-4">
                <div>
                  <p className="font-medium text-app-text">
                    <InfoLabel label="Perp Exposure" tooltipKey="perpExposure" />
                  </p>
                  <p className="text-xs text-app-muted">Open interest sleeve</p>
                </div>
                <span className="text-sm text-app-text">{formatBps(blended.perpBlendBps)}</span>
              </div>
            </div>
          </Card>
        </div>
      ) : showAssetsAddedNoPerpActivity ? (
        <div className="mb-8">
          <Card className="p-6">
            <p className="font-medium text-app-text">Assets added, no perp activity yet</p>
            <p className="mt-1 text-sm text-app-muted">
              This basket already has configured assets. Perp activity has not started yet.
            </p>
            <div className="mt-4 divide-y divide-app-border rounded-lg border border-app-border">
              {configuredAssetIds.map((assetId) => {
                const meta = assetMeta.get(assetId);
                const priceRow = configuredAssetPriceById.get(assetId);
                const updatedTs = Number(priceRow?.timestamp ?? 0n);
                return (
                  <div key={assetId} className="flex items-center justify-between px-4 py-3">
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
                    <p className="text-sm text-app-text">{formatBps(0n)}</p>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      ) : showNoAssetsAllocatedYet ? (
        <div className="mb-8">
          <Card className="p-6">
            <p className="font-medium text-app-text">No assets allocated yet</p>
            <p className="mt-1 text-sm text-app-muted">
              Assets are configured, but current composition allocation is {formatBps(0n)}.
            </p>
            <div className="mt-4 divide-y divide-app-border rounded-lg border border-app-border">
              {configuredAssetIds.map((assetId) => {
                const meta = assetMeta.get(assetId);
                const priceRow = configuredAssetPriceById.get(assetId);
                const updatedTs = Number(priceRow?.timestamp ?? 0n);
                return (
                  <div key={assetId} className="flex items-center justify-between px-4 py-3">
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
                    <p className="text-sm text-app-text">{formatBps(0n)}</p>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      ) : showNoAssetsListedYet ? (
        <div className="mb-8">
          <Card className="p-6">
            <p className="font-medium text-app-text">No assets listed yet</p>
            <p className="mt-1 text-sm text-app-muted">
              Add assets to this basket to enable per-asset composition tracking.
            </p>
          </Card>
        </div>
      ) : (
        <div className="mb-8">
          <Card className="p-6">
            <p className="font-medium text-app-text">Loading latest asset configuration...</p>
            <p className="mt-1 text-sm text-app-muted">
              Syncing onchain basket assets before determining composition state.
            </p>
          </Card>
        </div>
      )}

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
      <div className="mt-6">
        <BasketPositionManagerCard vault={vault} />
      </div>
    </PageWrapper>
  );
}

function BasketPositionManagerCard({ vault }: { vault: Address }) {
  const refreshAfterTx = usePostTxRefresh();
  const { data: supportedAssets } = useSupportedOracleAssets();
  const { data: vaultState } = useVaultState(vault);

  const [openAssetFilter, setOpenAssetFilter] = useState("");
  const [closeAssetFilter, setCloseAssetFilter] = useState("");
  const [openAsset, setOpenAsset] = useState<Hex | "">("");
  const [openSide, setOpenSide] = useState<"long" | "short">("long");
  const [openSize, setOpenSize] = useState("");
  const [openCollateral, setOpenCollateral] = useState("");
  const [closeAsset, setCloseAsset] = useState<Hex | "">("");
  const [closeSide, setCloseSide] = useState<"long" | "short">("long");
  const [closeSize, setCloseSize] = useState("");
  const [closeCollateral, setCloseCollateral] = useState("");

  const { data: maxOpenInterest } = useMaxOpenInterest(vault);
  const { data: maxPositionSize } = useMaxPositionSize(vault);
  const { data: closeTracking } = usePositionTracking(vault, closeAsset || undefined, closeSide === "long");
  const { openPosition, receipt: openReceipt, isPending: isOpenPending } = useOpenPosition();
  const { closePosition, receipt: closeReceipt, isPending: isClosePending } = useClosePosition();

  const filteredAssets = (supportedAssets ?? []).filter((asset) =>
    asset.label.toLowerCase().includes(openAssetFilter.toLowerCase())
  );
  const closeFilteredAssets = (supportedAssets ?? []).filter((asset) =>
    asset.label.toLowerCase().includes(closeAssetFilter.toLowerCase())
  );

  useEffect(() => {
    if (!openAsset && filteredAssets.length > 0) {
      setOpenAsset(filteredAssets[0].idHex as Hex);
    }
  }, [openAsset, filteredAssets]);

  useEffect(() => {
    if (!closeAsset && closeFilteredAssets.length > 0) {
      setCloseAsset(closeFilteredAssets[0].idHex as Hex);
    }
  }, [closeAsset, closeFilteredAssets]);

  useEffect(() => {
    if (openReceipt.isSuccess) {
      showToast("success", "Position opened");
      refreshAfterTx();
    }
  }, [openReceipt.isSuccess, refreshAfterTx]);

  useEffect(() => {
    if (closeReceipt.isSuccess) {
      showToast("success", "Position closed");
      refreshAfterTx();
    }
  }, [closeReceipt.isSuccess, refreshAfterTx]);

  const state = vaultState as {
    depositedCapital: bigint;
    realisedPnL: bigint;
    openInterest: bigint;
    collateralLocked: bigint;
  } | undefined;

  const availableCapital = state
    ? (() => {
        const total = state.depositedCapital + state.realisedPnL - state.collateralLocked;
        return total > 0n ? total : 0n;
      })()
    : 0n;

  const openInterestCap = (maxOpenInterest as bigint | undefined) ?? 0n;
  const positionSizeCap = (maxPositionSize as bigint | undefined) ?? 0n;
  const openInterest = state?.openInterest ?? 0n;
  const remainingOpenInterest = openInterestCap > 0n && openInterestCap > openInterest ? openInterestCap - openInterest : 0n;

  const openSizeMax =
    openInterestCap > 0n && positionSizeCap > 0n
      ? (remainingOpenInterest < positionSizeCap ? remainingOpenInterest : positionSizeCap)
      : openInterestCap > 0n
        ? remainingOpenInterest
        : positionSizeCap > 0n
          ? positionSizeCap
          : 0n;

  const closePos = closeTracking as {
    size: bigint;
    collateralUsdc: bigint;
    exists: boolean;
  } | undefined;

  const closeSizeMax = closePos?.exists ? closePos.size : 0n;
  const closeCollateralMax = closePos?.exists ? closePos.collateralUsdc : 0n;

  return (
    <Card className="p-6">
      <h3 className="mb-4 text-base font-semibold text-app-text">
        <InfoLabel label="Perp Position Management" tooltipKey="perpPositionManagement" />
      </h3>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-app-border p-4">
          <p className="mb-3 text-sm font-semibold text-app-text">Open Position</p>
          <div className="grid gap-3">
            <Input
              placeholder="Filter assets..."
              value={openAssetFilter}
              onChange={(e) => setOpenAssetFilter(e.target.value)}
            />
            <select
              value={openAsset}
              onChange={(e) => setOpenAsset(e.target.value as Hex)}
              className="h-11 w-full rounded-xl border border-app-border bg-app-bg px-3 text-app-text"
            >
              {filteredAssets.map((asset) => (
                <option key={asset.idHex} value={asset.idHex}>
                  {asset.label}
                </option>
              ))}
            </select>
            <SegmentedControl
              options={[
                { value: "long", label: "Long" },
                { value: "short", label: "Short" },
              ]}
              value={openSide}
              onChange={(value) => setOpenSide(value as "long" | "short")}
            />
            <Input type="number" placeholder="Size (USDC)" value={openSize} onChange={(e) => setOpenSize(e.target.value)} />
            <div className="flex items-center justify-between text-xs text-app-muted">
              <span>Max Size: {openSizeMax > 0n ? formatUSDC(openSizeMax) : "Unlimited"}</span>
              {openSizeMax > 0n && (
                <button className="underline" onClick={() => setOpenSize(usdcToInputValue(openSizeMax))}>
                  Use max
                </button>
              )}
            </div>
            <Input
              type="number"
              placeholder="Collateral (USDC)"
              value={openCollateral}
              onChange={(e) => setOpenCollateral(e.target.value)}
            />
            <div className="flex items-center justify-between text-xs text-app-muted">
              <span>Max Collateral: {formatUSDC(availableCapital)}</span>
              <button className="underline" onClick={() => setOpenCollateral(usdcToInputValue(availableCapital))}>
                Use max
              </button>
            </div>
            <Button
              disabled={!openAsset || !openSize || !openCollateral || isOpenPending}
              onClick={() => {
                openPosition(
                  vault,
                  openAsset as Hex,
                  openSide === "long",
                  parseUSDCInput(openSize),
                  parseUSDCInput(openCollateral)
                );
                showToast("pending", "Opening position...");
              }}
            >
              {isOpenPending ? "Processing..." : "Open"}
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-app-border p-4">
          <p className="mb-3 text-sm font-semibold text-app-text">Close Position</p>
          <div className="grid gap-3">
            <Input
              placeholder="Filter assets..."
              value={closeAssetFilter}
              onChange={(e) => setCloseAssetFilter(e.target.value)}
            />
            <select
              value={closeAsset}
              onChange={(e) => setCloseAsset(e.target.value as Hex)}
              className="h-11 w-full rounded-xl border border-app-border bg-app-bg px-3 text-app-text"
            >
              {closeFilteredAssets.map((asset) => (
                <option key={asset.idHex} value={asset.idHex}>
                  {asset.label}
                </option>
              ))}
            </select>
            <SegmentedControl
              options={[
                { value: "long", label: "Long" },
                { value: "short", label: "Short" },
              ]}
              value={closeSide}
              onChange={(value) => setCloseSide(value as "long" | "short")}
            />
            <Input type="number" placeholder="Size Delta (USDC)" value={closeSize} onChange={(e) => setCloseSize(e.target.value)} />
            <div className="flex items-center justify-between text-xs text-app-muted">
              <span>Max Size Delta: {formatUSDC(closeSizeMax)}</span>
              {closeSizeMax > 0n && (
                <button className="underline" onClick={() => setCloseSize(usdcToInputValue(closeSizeMax))}>
                  Use max
                </button>
              )}
            </div>
            <Input
              type="number"
              placeholder="Collateral Delta (USDC)"
              value={closeCollateral}
              onChange={(e) => setCloseCollateral(e.target.value)}
            />
            <div className="flex items-center justify-between text-xs text-app-muted">
              <span>Max Collateral Delta: {formatUSDC(closeCollateralMax)}</span>
              {closeCollateralMax > 0n && (
                <button className="underline" onClick={() => setCloseCollateral(usdcToInputValue(closeCollateralMax))}>
                  Use max
                </button>
              )}
            </div>
            <Button
              variant="danger"
              disabled={!closeAsset || !closeSize || isClosePending}
              onClick={() => {
                closePosition(
                  vault,
                  closeAsset as Hex,
                  closeSide === "long",
                  parseUSDCInput(closeSize),
                  parseUSDCInput(closeCollateral || "0")
                );
                showToast("pending", "Closing position...");
              }}
            >
              {isClosePending ? "Processing..." : "Close"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function SetAssetsCard({ vault }: { vault: Address }) {
  const refreshAfterTx = usePostTxRefresh();
  const { data: supportedAssets } = useSupportedOracleAssets();
  const supported = supportedAssets ?? [];
  const { setAssets, receipt, isPending, error, isError } = useSetAssets();
  const [rows, setRows] = useState<Array<{ assetIdHex: `0x${string}` | ""; assetQuery: string }>>([
    { assetIdHex: "", assetQuery: "" },
  ]);

  const selectedAssets = rows.map((row) => row.assetIdHex).filter((id): id is `0x${string}` => id !== "");
  const hasDuplicateAssets = new Set(selectedAssets).size !== selectedAssets.length;
  const hasEmptyAssetSelection = rows.some((row) => row.assetIdHex === "");

  useEffect(() => {
    if (receipt.isSuccess) {
      showToast("success", "Assets updated");
      refreshAfterTx();
    }
  }, [receipt.isSuccess, refreshAfterTx]);

  useContractErrorToast({
    writeError: error,
    writeIsError: isError,
    receiptError: receipt.error,
    receiptIsError: receipt.isError,
    fallbackMessage: "Set assets failed",
  });

  return (
    <Card className="p-6">
      <h3 className="mb-4 text-base font-semibold text-app-text">
        <InfoLabel label="Set Assets" tooltipKey="setAssets" />
      </h3>
      {rows.map((row, i) => (
        <div key={i} className="mb-2 flex gap-2">
          <datalist id={`set-assets-${i}`}>
            {supported
              .filter((asset) => {
                const isCurrent = asset.idHex === row.assetIdHex;
                const selectedElsewhere = selectedAssets.includes(asset.idHex) && !isCurrent;
                return !selectedElsewhere;
              })
              .map((asset) => (
                <option key={asset.idHex} value={asset.label}>
                  {asset.idHex}
                </option>
              ))}
          </datalist>
          <Input
            list={`set-assets-${i}`}
            placeholder="Select supported asset"
            value={row.assetQuery}
            onChange={(e) => {
              const query = e.target.value;
              const match = supported.find(
                (asset) =>
                  asset.label.toLowerCase() === query.toLowerCase() ||
                  asset.idHex.toLowerCase() === query.toLowerCase()
              );
              const next = [...rows];
              if (match) {
                const selectedElsewhere = next.some((entry, idx) => idx !== i && entry.assetIdHex === match.idHex);
                if (selectedElsewhere) {
                  next[i] = { ...next[i], assetIdHex: "", assetQuery: query };
                } else {
                  next[i] = { ...next[i], assetIdHex: match.idHex, assetQuery: match.label };
                }
              } else {
                next[i] = { ...next[i], assetIdHex: "", assetQuery: query };
              }
              setRows(next);
            }}
            onBlur={() => {
              if (rows[i].assetIdHex !== "") return;
              const next = [...rows];
              next[i] = { ...next[i], assetQuery: "" };
              setRows(next);
            }}
            className="flex-1"
          />
          {rows.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
            >
              Remove
            </Button>
          )}
        </div>
      ))}
      <div className="mt-2 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setRows([...rows, { assetIdHex: "", assetQuery: "" }])}
        >
          Add Asset
        </Button>
      </div>
      {hasDuplicateAssets && <p className="mt-2 text-xs text-app-danger">Duplicate assets are not allowed.</p>}
      <Button
        size="sm"
        className="mt-4"
        disabled={isPending || hasEmptyAssetSelection || hasDuplicateAssets}
        onClick={() => {
          const assetIds = rows.map((row) => row.assetIdHex as `0x${string}`);
          setAssets(vault, assetIds);
          showToast("pending", "Updating assets...");
        }}
      >
        {isPending ? "Processing..." : "Set Assets"}
      </Button>
    </Card>
  );
}

function PerpAllocationCard({
  vault,
  currentAllocation,
  availableToDeposit,
}: {
  vault: Address;
  currentAllocation: bigint;
  availableToDeposit: bigint;
}) {
  const [amount, setAmount] = useState("");
  const refreshAfterTx = usePostTxRefresh();
  const { writeContract, data: hash, isPending, error, isError } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (receipt.isSuccess) {
      showToast("success", "Allocation updated");
      refreshAfterTx();
    }
  }, [receipt.isSuccess, refreshAfterTx]);

  useContractErrorToast({
    writeError: error,
    writeIsError: isError,
    receiptError: receipt.error,
    receiptIsError: receipt.isError,
    fallbackMessage: "Perp allocation update failed",
  });

  return (
    <Card className="p-6">
      <h3 className="mb-4 text-base font-semibold text-app-text">
        <InfoLabel label="Perp Allocation" tooltipKey="perpAllocation" />
      </h3>
      <p className="text-sm text-app-muted">Current: {formatUSDC(currentAllocation)}</p>
      <p className="mb-4 text-sm text-app-muted">Available to Deposit: {formatUSDC(availableToDeposit)}</p>
      <Input
        type="number"
        placeholder="USDC amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="mb-3"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!amount || isPending}
          onClick={() => {
            writeContract({
              address: vault,
              abi: BasketVaultABI,
              functionName: "allocateToPerp",
              args: [parseUSDCInput(amount)],
            });
            showToast("pending", "Allocating...");
          }}
        >
          Allocate
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!amount || isPending}
          onClick={() => {
            writeContract({
              address: vault,
              abi: BasketVaultABI,
              functionName: "withdrawFromPerp",
              args: [parseUSDCInput(amount)],
            });
            showToast("pending", "Withdrawing...");
          }}
        >
          Withdraw
        </Button>
      </div>
    </Card>
  );
}

function MaxPerpAllocationCard({ vault }: { vault: Address }) {
  const [amount, setAmount] = useState("");
  const { data: currentCap } = useMaxPerpAllocation(vault);
  const { setMaxPerpAllocation, receipt, isPending, error, isError } = useSetMaxPerpAllocation();

  const capValue = currentCap as bigint | undefined;

  useEffect(() => {
    if (receipt.isSuccess) {
      showToast("success", "Max perp allocation updated");
      setAmount("");
    }
  }, [receipt.isSuccess]);

  useContractErrorToast({
    writeError: error,
    writeIsError: isError,
    receiptError: receipt.error,
    receiptIsError: receipt.isError,
    fallbackMessage: "Max perp allocation update failed",
  });

  return (
    <Card className="p-6">
      <h3 className="mb-2 text-base font-semibold text-app-text">
        <InfoLabel label="Max Perp Allocation" tooltipKey="maxPerpAllocation" />
      </h3>
      <p className="mb-4 text-sm text-app-muted">
        Current:{" "}
        {capValue === undefined
          ? "--"
          : capValue === 0n
            ? "Unlimited"
            : formatUSDC(capValue)}
      </p>
      <Input
        type="number"
        placeholder="USDC cap (0 = unlimited)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="mb-3"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!amount || isPending}
          onClick={() => {
            setMaxPerpAllocation(vault, parseUSDCInput(amount));
            showToast("pending", "Setting cap...");
          }}
        >
          Set Cap
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => {
            setMaxPerpAllocation(vault, 0n);
            showToast("pending", "Removing cap...");
          }}
        >
          Clear
        </Button>
      </div>
    </Card>
  );
}

function FeeCollectionCard({ vault }: { vault: Address }) {
  const { writeContract, data: hash, isPending, error, isError } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  const [recipient, setRecipient] = useState("");

  useEffect(() => {
    if (receipt.isSuccess) {
      showToast("success", "Fees collected");
    }
  }, [receipt.isSuccess]);

  useContractErrorToast({
    writeError: error,
    writeIsError: isError,
    receiptError: receipt.error,
    receiptIsError: receipt.isError,
    fallbackMessage: "Fee collection failed",
  });

  return (
    <Card className="p-6">
      <h3 className="mb-4 text-base font-semibold text-app-text">
        <InfoLabel label="Collect Fees" tooltipKey="collectFees" />
      </h3>
      <Input
        placeholder="Recipient address"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        className="mb-3"
      />
      <Button
        size="sm"
        disabled={!recipient || isPending}
        onClick={() => {
          writeContract({
            address: vault,
            abi: BasketVaultABI,
            functionName: "collectFees",
            args: [recipient as Address],
          });
          showToast("pending", "Collecting fees...");
        }}
      >
        Collect Fees
      </Button>
    </Card>
  );
}

function ReservePolicyCard({ vault }: { vault: Address }) {
  const [bpsInput, setBpsInput] = useState("");
  const { data: currentBps } = useMinReserveBps(vault);
  const { setMinReserveBps, receipt, isPending, error, isError } = useSetMinReserveBps();

  useEffect(() => {
    if (receipt.isSuccess) {
      showToast("success", "Reserve policy updated");
    }
  }, [receipt.isSuccess]);

  useContractErrorToast({
    writeError: error,
    writeIsError: isError,
    receiptError: receipt.error,
    receiptIsError: receipt.isError,
    fallbackMessage: "Reserve policy update failed",
  });

  return (
    <Card className="p-6">
      <h3 className="mb-2 text-base font-semibold text-app-text">
        <InfoLabel label="Reserve Policy" tooltipKey="reservePolicy" />
      </h3>
      <p className="mb-4 text-sm text-app-muted">
        Current target: {formatBps((currentBps as bigint | undefined) ?? 0n)}
      </p>
      <Input
        type="number"
        min="0"
        max="10000"
        placeholder="BPS (0 - 10000)"
        value={bpsInput}
        onChange={(e) => setBpsInput(e.target.value)}
        className="mb-3"
      />
      <Button
        size="sm"
        disabled={!bpsInput || isPending}
        onClick={() => {
          setMinReserveBps(vault, BigInt(bpsInput));
          showToast("pending", "Updating reserve policy...");
        }}
      >
        Set Reserve Target
      </Button>
    </Card>
  );
}

function ReserveTopUpCard({ vault, usdc }: { vault: Address; usdc: Address }) {
  const [amount, setAmount] = useState("");
  const { address } = useAccount();
  const { data: allowance } = useUSDCAllowance(usdc, address, vault);
  const {
    approve,
    receipt: approveReceipt,
    isPending: isApproving,
    error: approveError,
    isError: isApproveError,
  } = useApproveUSDC();
  const {
    topUpReserve,
    receipt: topUpReceipt,
    isPending: isToppingUp,
    error: topUpError,
    isError: isTopUpError,
  } = useTopUpReserve();

  const parsedAmount = amount ? parseUSDCInput(amount) : 0n;
  const needsApproval = parsedAmount > 0n && (allowance ?? 0n) < parsedAmount;
  const isProcessing = isApproving || isToppingUp;

  useEffect(() => {
    if (approveReceipt.isSuccess) {
      showToast("success", "USDC approved");
    }
  }, [approveReceipt.isSuccess]);

  useEffect(() => {
    if (topUpReceipt.isSuccess) {
      showToast("success", "Reserve topped up");
    }
  }, [topUpReceipt.isSuccess]);

  useContractErrorToast({
    writeError: approveError,
    writeIsError: isApproveError,
    receiptError: approveReceipt.error,
    receiptIsError: approveReceipt.isError,
    fallbackMessage: "USDC approval failed",
  });
  useContractErrorToast({
    writeError: topUpError,
    writeIsError: isTopUpError,
    receiptError: topUpReceipt.error,
    receiptIsError: topUpReceipt.isError,
    fallbackMessage: "Reserve top up failed",
  });

  return (
    <Card className="p-6">
      <h3 className="mb-2 text-base font-semibold text-app-text">
        <InfoLabel label="Top Up Reserve" tooltipKey="topUpReserve" />
      </h3>
      <p className="mb-4 text-sm text-app-muted">
        Transfer USDC into the vault without minting shares.
      </p>
      <Input
        type="number"
        placeholder="USDC amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="mb-3"
      />
      <Button
        size="sm"
        disabled={!address || parsedAmount === 0n || isProcessing}
        onClick={() => {
          if (needsApproval) {
            approve(usdc, vault, parsedAmount);
            showToast("pending", "Approving USDC...");
            return;
          }
          topUpReserve(vault, parsedAmount);
          showToast("pending", "Topping up reserve...");
        }}
      >
        {isProcessing ? "Processing..." : needsApproval ? "Approve USDC" : "Top Up Reserve"}
      </Button>
    </Card>
  );
}
