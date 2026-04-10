"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { InfoLabel } from "@/components/ui/info-tooltip";
import { useSupportedOracleAssets } from "@/hooks/useOracle";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { getContracts } from "@/config/contracts";
import { OracleAdapterABI, VaultAccountingABI } from "@/abi/contracts";
import { useReadContracts } from "wagmi";
import { type Address, encodePacked, keccak256 } from "viem";
import { formatUSDC, formatPrice, formatAssetId, formatSignedUsd1e30 } from "@/lib/format";
import { PRICE_PRECISION, USDC_PRECISION, REFETCH_INTERVAL } from "@/lib/constants";
import { cn } from "@/lib/utils";

export type PositionWithPnL = {
  assetId: `0x${string}`;
  isLong: boolean;
  size: bigint;
  collateral: bigint;
  collateralUsdc: bigint;
  averagePrice: bigint;
  label: string;
  currentPrice: bigint;
  unrealisedPnL: bigint;
};

function leverageDisplay(size: bigint, collateralUsdc: bigint): string {
  if (collateralUsdc === 0n) return "--";
  const collateral1e30 = (collateralUsdc * PRICE_PRECISION) / USDC_PRECISION;
  if (collateral1e30 === 0n) return "--";
  const lev = Number(size * 100n / collateral1e30) / 100;
  return `${lev.toFixed(2)}x`;
}

function pnlPct(pnl: bigint, collateralUsdc: bigint): string {
  if (collateralUsdc === 0n) return "--";
  const collateral1e30 = (collateralUsdc * PRICE_PRECISION) / USDC_PRECISION;
  if (collateral1e30 === 0n) return "--";
  const pct = Number(pnl * 10000n / collateral1e30) / 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export function PositionsTable({ vault, className }: { vault: Address; className?: string }) {
  const { data: supportedAssets } = useSupportedOracleAssets();
  const { chainId } = useDeploymentTarget();
  const { oracleAdapter, vaultAccounting } = getContracts(chainId);

  const allAssets = useMemo(() => supportedAssets ?? [], [supportedAssets]);
  const posKeys = useMemo(
    () =>
      allAssets.flatMap((asset) => [
        {
          assetId: asset.idHex as `0x${string}`,
          isLong: true,
          key: keccak256(encodePacked(["address", "bytes32", "bool"], [vault, asset.idHex as `0x${string}`, true])),
        },
        {
          assetId: asset.idHex as `0x${string}`,
          isLong: false,
          key: keccak256(encodePacked(["address", "bytes32", "bool"], [vault, asset.idHex as `0x${string}`, false])),
        },
      ]),
    [allAssets, vault],
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

  const positions: PositionWithPnL[] = useMemo(() => {
    const rows = openPositions.map((pos, i) => {
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
    return rows.sort((a, b) => {
      const absA = a.unrealisedPnL >= 0n ? a.unrealisedPnL : -a.unrealisedPnL;
      const absB = b.unrealisedPnL >= 0n ? b.unrealisedPnL : -b.unrealisedPnL;
      return absB > absA ? 1 : absB < absA ? -1 : 0;
    });
  }, [openPositions, positionPriceRows]);

  if (positions.length === 0) {
    return (
      <Card className={cn("p-5", className)}>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-app-muted">
          <InfoLabel label="Open Positions" tooltipKey="unrealisedPnl" />
        </h2>
        <p className="py-6 text-center text-sm text-app-muted">No open positions</p>
      </Card>
    );
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="px-5 pt-4 pb-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-app-muted">
          <InfoLabel label="Open Positions" tooltipKey="unrealisedPnl" />
        </h2>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app-border bg-app-bg-subtle/60 text-left text-[10px] font-semibold uppercase tracking-wider text-app-muted">
              <th className="px-4 py-2.5">Asset</th>
              <th className="px-4 py-2.5">Side</th>
              <th className="px-4 py-2.5 text-right">Size</th>
              <th className="px-4 py-2.5 text-right">Collateral</th>
              <th className="px-4 py-2.5 text-right">Entry</th>
              <th className="px-4 py-2.5 text-right">Mark</th>
              <th className="px-4 py-2.5 text-right">Lev</th>
              <th className="px-4 py-2.5 text-right">PnL</th>
              <th className="px-4 py-2.5 text-right">PnL %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-app-border">
            {positions.map((pos) => (
              <tr
                key={`${pos.assetId}-${pos.isLong ? "long" : "short"}`}
                className="hover:bg-app-surface-hover"
              >
                <td className="px-4 py-2.5 font-medium text-app-text">{pos.label}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                      pos.isLong
                        ? "bg-app-success/10 text-app-success"
                        : "bg-app-danger/10 text-app-danger",
                    )}
                  >
                    {pos.isLong ? "Long" : "Short"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-app-text">
                  {formatPrice(pos.size)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-app-text">
                  {formatUSDC(pos.collateralUsdc)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-app-text">
                  {formatPrice(pos.averagePrice)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-app-text">
                  {pos.currentPrice > 0n ? formatPrice(pos.currentPrice) : "--"}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-app-text">
                  {leverageDisplay(pos.size, pos.collateralUsdc)}
                </td>
                <td
                  className={cn(
                    "px-4 py-2.5 text-right font-mono font-semibold",
                    pos.unrealisedPnL > 0n
                      ? "text-app-success"
                      : pos.unrealisedPnL < 0n
                        ? "text-app-danger"
                        : "text-app-text",
                  )}
                >
                  {formatSignedUsd1e30(pos.unrealisedPnL)}
                </td>
                <td
                  className={cn(
                    "px-4 py-2.5 text-right font-mono text-xs font-semibold",
                    pos.unrealisedPnL > 0n
                      ? "text-app-success"
                      : pos.unrealisedPnL < 0n
                        ? "text-app-danger"
                        : "text-app-text",
                  )}
                >
                  {pnlPct(pos.unrealisedPnL, pos.collateralUsdc)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked cards */}
      <div className="divide-y divide-app-border sm:hidden">
        {positions.map((pos) => (
          <div
            key={`m-${pos.assetId}-${pos.isLong ? "long" : "short"}`}
            className="px-4 py-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-app-text">{pos.label}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase",
                    pos.isLong
                      ? "bg-app-success/10 text-app-success"
                      : "bg-app-danger/10 text-app-danger",
                  )}
                >
                  {pos.isLong ? "Long" : "Short"}
                </span>
              </div>
              <span
                className={cn(
                  "font-mono text-sm font-semibold",
                  pos.unrealisedPnL > 0n
                    ? "text-app-success"
                    : pos.unrealisedPnL < 0n
                      ? "text-app-danger"
                      : "text-app-text",
                )}
              >
                {formatSignedUsd1e30(pos.unrealisedPnL)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-app-muted">
              <span>Size {formatPrice(pos.size)}</span>
              <span>Collateral {formatUSDC(pos.collateralUsdc)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-app-muted">
              <span>Entry {formatPrice(pos.averagePrice)}</span>
              <span>Mark {pos.currentPrice > 0n ? formatPrice(pos.currentPrice) : "--"}</span>
              <span>{leverageDisplay(pos.size, pos.collateralUsdc)}</span>
              <span
                className={cn(
                  "font-semibold",
                  pos.unrealisedPnL > 0n
                    ? "text-app-success"
                    : pos.unrealisedPnL < 0n
                      ? "text-app-danger"
                      : "text-app-muted",
                )}
              >
                {pnlPct(pos.unrealisedPnL, pos.collateralUsdc)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
