"use client";

import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { InfoLabel } from "@/components/ui/info-tooltip";
import { showToast } from "@/components/ui/toast";
import { useSupportedOracleAssets } from "@/hooks/useOracle";
import { useVaultState } from "@/hooks/usePerpReader";
import {
  useClosePosition,
  useMaxOpenInterest,
  useMaxPositionSize,
  useOpenPosition,
  usePositionTracking,
} from "@/hooks/useVaultAccounting";
import { formatUSDC, formatPrice, formatAssetId, formatSignedUsd1e30, parseUSDCInput } from "@/lib/format";
import { PRICE_PRECISION, USDC_PRECISION, REFETCH_INTERVAL } from "@/lib/constants";
import { useContractErrorToast } from "@/hooks/useContractErrorToast";
import { usePostTxRefresh } from "@/hooks/usePostTxRefresh";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { getContracts } from "@/config/contracts";
import { OracleAdapterABI, VaultAccountingABI } from "@/abi/contracts";
import { useReadContracts } from "wagmi";
import { type Address, type Hex, encodePacked, keccak256 } from "viem";

function usdcToInputValue(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const frac = amount % 1_000_000n;
  if (frac === 0n) return whole.toString();
  return `${whole.toString()}.${frac.toString().padStart(6, "0").replace(/0+$/, "")}`;
}

function usd1e30ToInputValue(amount: bigint): string {
  const usdcAtoms = (amount * USDC_PRECISION) / PRICE_PRECISION;
  return usdcToInputValue(usdcAtoms);
}

function parseUsdInputTo1e30(value: string): bigint {
  const usdcAtoms = parseUSDCInput(value);
  return (usdcAtoms * PRICE_PRECISION) / USDC_PRECISION;
}

export function BasketPositionManagerCard({ vault }: { vault: Address }) {
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
  const [confirmClose, setConfirmClose] = useState(false);

  const { data: maxOpenInterest } = useMaxOpenInterest(vault);
  const { data: maxPositionSize } = useMaxPositionSize(vault);
  const { data: closeTracking } = usePositionTracking(vault, closeAsset || undefined, closeSide === "long");
  const openTx = useOpenPosition();
  const closeTx = useClosePosition();
  const { openPosition, receipt: openReceipt, isPending: isOpenPending } = openTx;
  const { closePosition, receipt: closeReceipt, isPending: isClosePending } = closeTx;

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
      setConfirmClose(false);
      refreshAfterTx();
    }
  }, [closeReceipt.isSuccess, refreshAfterTx]);

  useEffect(() => {
    if (!confirmClose) return;
    const timer = setTimeout(() => setConfirmClose(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmClose]);

  useContractErrorToast({
    writeError: openTx.error,
    writeIsError: openTx.isError,
    receiptError: openReceipt.error,
    receiptIsError: openReceipt.isError,
    fallbackMessage: "Open position failed",
  });

  useContractErrorToast({
    writeError: closeTx.error,
    writeIsError: closeTx.isError,
    receiptError: closeReceipt.error,
    receiptIsError: closeReceipt.isError,
    fallbackMessage: "Close position failed",
  });

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

  const { chainId } = useDeploymentTarget();
  const { oracleAdapter, vaultAccounting } = getContracts(chainId);

  const allAssets = useMemo(() => supportedAssets ?? [], [supportedAssets]);
  const posKeys = useMemo(
    () =>
      allAssets.flatMap((asset) => [
        { assetId: asset.idHex as `0x${string}`, isLong: true, key: keccak256(encodePacked(["address", "bytes32", "bool"], [vault, asset.idHex as `0x${string}`, true])) },
        { assetId: asset.idHex as `0x${string}`, isLong: false, key: keccak256(encodePacked(["address", "bytes32", "bool"], [vault, asset.idHex as `0x${string}`, false])) },
      ]),
    [allAssets, vault]
  );

  const { data: allTrackingRows } = useReadContracts({
    contracts: posKeys.map((entry) => ({
      address: vaultAccounting,
      abi: VaultAccountingABI,
      functionName: "getPositionTracking" as const,
      args: [entry.key] as const,
    })),
    query: { enabled: posKeys.length > 0, refetchInterval: REFETCH_INTERVAL },
  });

  const openPositions = useMemo(() => {
    const positions: Array<{
      assetId: `0x${string}`;
      isLong: boolean;
      size: bigint;
      collateral: bigint;
      collateralUsdc: bigint;
      averagePrice: bigint;
      label: string;
    }> = [];

    posKeys.forEach((entry, i) => {
      const raw = allTrackingRows?.[i]?.result;
      if (!raw) return;
      const tracking = raw as
        | { size?: bigint; collateral?: bigint; collateralUsdc?: bigint; averagePrice?: bigint; exists?: boolean }
        | [Address, `0x${string}`, boolean, bigint, bigint, bigint, bigint, bigint, boolean];
      const exists = Array.isArray(tracking) ? Boolean(tracking[8]) : Boolean(tracking.exists);
      if (!exists) return;
      const size = Array.isArray(tracking) ? tracking[3] : (tracking.size ?? 0n);
      const collateral = Array.isArray(tracking) ? tracking[4] : (tracking.collateral ?? 0n);
      const collateralUsdc = Array.isArray(tracking) ? tracking[5] : (tracking.collateralUsdc ?? 0n);
      const averagePrice = Array.isArray(tracking) ? tracking[6] : (tracking.averagePrice ?? 0n);
      if (size === 0n) return;
      const meta = allAssets.find((a) => (a.idHex as string).toLowerCase() === entry.assetId.toLowerCase());
      positions.push({
        assetId: entry.assetId,
        isLong: entry.isLong,
        size,
        collateral,
        collateralUsdc,
        averagePrice,
        label: meta?.label ?? formatAssetId(entry.assetId),
      });
    });

    return positions;
  }, [allAssets, allTrackingRows, posKeys]);

  const { data: positionPriceRows } = useReadContracts({
    contracts: openPositions.map((pos) => ({
      address: oracleAdapter,
      abi: OracleAdapterABI,
      functionName: "getPrice" as const,
      args: [pos.assetId] as const,
    })),
    query: { enabled: openPositions.length > 0, refetchInterval: REFETCH_INTERVAL },
  });

  const positionsWithPnL = useMemo(() => {
    return openPositions.map((pos, i) => {
      const priceRow = positionPriceRows?.[i]?.result as [bigint, bigint] | undefined;
      const currentPrice = priceRow?.[0] ?? 0n;
      let unrealisedPnL = 0n;
      if (currentPrice > 0n && pos.averagePrice > 0n) {
        if (pos.isLong) {
          unrealisedPnL = ((currentPrice - pos.averagePrice) * pos.size) / pos.averagePrice;
        } else {
          unrealisedPnL = ((pos.averagePrice - currentPrice) * pos.size) / pos.averagePrice;
        }
      }
      return { ...pos, currentPrice, unrealisedPnL };
    });
  }, [openPositions, positionPriceRows]);

  const handleCloseClick = () => {
    if (!confirmClose) {
      setConfirmClose(true);
      return;
    }
    closePosition(
      vault,
      closeAsset as Hex,
      closeSide === "long",
      parseUsdInputTo1e30(closeSize),
      parseUSDCInput(closeCollateral || "0")
    );
    showToast("pending", "Closing position...");
    setConfirmClose(false);
  };

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
              data-testid="open-position-filter"
              onChange={(e) => setOpenAssetFilter(e.target.value)}
            />
            <Select
              value={openAsset}
              data-testid="open-position-asset"
              onChange={(e) => setOpenAsset(e.target.value as Hex)}
            >
              {filteredAssets.map((asset) => (
                <option key={asset.idHex} value={asset.idHex}>
                  {asset.label}
                </option>
              ))}
            </Select>
            <SegmentedControl
              options={[
                { value: "long", label: "Long" },
                { value: "short", label: "Short" },
              ]}
              value={openSide}
              onChange={(value) => setOpenSide(value as "long" | "short")}
            />
            <Input
              type="number"
              placeholder="Size (USD notional)"
              value={openSize}
              data-testid="open-position-size"
              onChange={(e) => setOpenSize(e.target.value)}
            />
            <div className="flex items-center justify-between text-xs text-app-muted">
              <span>Max Size: {openSizeMax > 0n ? formatPrice(openSizeMax) : "Unlimited"}</span>
              {openSizeMax > 0n && (
                <button className="underline" onClick={() => setOpenSize(usd1e30ToInputValue(openSizeMax))}>
                  Use max
                </button>
              )}
            </div>
            <Input
              type="number"
              placeholder="Collateral (USDC)"
              value={openCollateral}
              data-testid="open-position-collateral"
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
              data-testid="open-position-submit"
              onClick={() => {
                openPosition(
                  vault,
                  openAsset as Hex,
                  openSide === "long",
                  parseUsdInputTo1e30(openSize),
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
              data-testid="close-position-filter"
              onChange={(e) => setCloseAssetFilter(e.target.value)}
            />
            <Select
              value={closeAsset}
              data-testid="close-position-asset"
              onChange={(e) => setCloseAsset(e.target.value as Hex)}
            >
              {closeFilteredAssets.map((asset) => (
                <option key={asset.idHex} value={asset.idHex}>
                  {asset.label}
                </option>
              ))}
            </Select>
            <SegmentedControl
              options={[
                { value: "long", label: "Long" },
                { value: "short", label: "Short" },
              ]}
              value={closeSide}
              onChange={(value) => setCloseSide(value as "long" | "short")}
            />
            <Input
              type="number"
              placeholder="Size Delta (USD notional)"
              value={closeSize}
              data-testid="close-position-size"
              onChange={(e) => setCloseSize(e.target.value)}
            />
            <div className="flex items-center justify-between text-xs text-app-muted">
              <span>Max Size Delta: {formatPrice(closeSizeMax)}</span>
              {closeSizeMax > 0n && (
                <button className="underline" onClick={() => setCloseSize(usd1e30ToInputValue(closeSizeMax))}>
                  Use max
                </button>
              )}
            </div>
            <Input
              type="number"
              placeholder="Collateral Delta (USDC)"
              value={closeCollateral}
              data-testid="close-position-collateral"
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
              data-testid="close-position-submit"
              onClick={handleCloseClick}
            >
              {isClosePending ? "Processing..." : confirmClose ? "Confirm Close?" : "Close"}
            </Button>
          </div>
        </div>
      </div>

      {positionsWithPnL.length > 0 && (
        <div className="mt-6">
          <p className="mb-3 text-sm font-semibold text-app-text">
            <InfoLabel label="Open Positions P&L" tooltipKey="unrealisedPnl" />
          </p>
          <div className="overflow-x-auto rounded-lg border border-app-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-app-border bg-app-bg-subtle/60 text-left text-xs font-semibold uppercase tracking-wider text-app-muted">
                  <th className="px-4 py-3">Asset</th>
                  <th className="px-4 py-3">Side</th>
                  <th className="px-4 py-3 text-right">Size</th>
                  <th className="px-4 py-3 text-right">Collateral</th>
                  <th className="px-4 py-3 text-right">Entry Price</th>
                  <th className="px-4 py-3 text-right">Current Price</th>
                  <th className="px-4 py-3 text-right">Unrealised P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border">
                {positionsWithPnL.map((pos) => (
                  <tr key={`${pos.assetId}-${pos.isLong ? "long" : "short"}`} className="hover:bg-app-surface-hover">
                    <td className="px-4 py-3 font-medium text-app-text">{pos.label}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${pos.isLong ? "bg-app-success/10 text-app-success" : "bg-app-danger/10 text-app-danger"}`}>
                        {pos.isLong ? "Long" : "Short"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-app-text">{formatPrice(pos.size)}</td>
                    <td className="px-4 py-3 text-right font-mono text-app-text">{formatUSDC(pos.collateralUsdc)}</td>
                    <td className="px-4 py-3 text-right font-mono text-app-text">{formatPrice(pos.averagePrice)}</td>
                    <td className="px-4 py-3 text-right font-mono text-app-text">{pos.currentPrice > 0n ? formatPrice(pos.currentPrice) : "--"}</td>
                    <td className={`px-4 py-3 text-right font-mono font-semibold ${pos.unrealisedPnL > 0n ? "text-app-success" : pos.unrealisedPnL < 0n ? "text-app-danger" : "text-app-text"}`}>
                      {formatSignedUsd1e30(pos.unrealisedPnL)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}
