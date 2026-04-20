"use client";

import { getChainMeta } from "@/components/chains/chain-icons";
import { formatUSDC, formatShares } from "@/lib/format";
import { PRICE_PRECISION } from "@/lib/constants";
import { cn } from "@/lib/utils";

export interface RoutingSplit {
  chainId: number;
  chainSelector: bigint;
  chainName: string;
  amount: bigint;
  percentage: number;
}

interface RoutingBreakdownProps {
  splits: RoutingSplit[];
  totalAmount: bigint;
  sharePrice: bigint;
  depositFeeBps: bigint;
  className?: string;
}

function estimateShares(amount: bigint, sharePrice: bigint, depositFeeBps: bigint): bigint {
  if (sharePrice <= 0n) return 0n;
  return (amount * (10000n - depositFeeBps) * PRICE_PRECISION) / (10000n * sharePrice);
}

export function RoutingBreakdown({ splits, totalAmount, sharePrice, depositFeeBps, className }: RoutingBreakdownProps) {
  if (splits.length === 0) {
    return (
      <div className={cn("rounded-lg border border-app-border bg-app-bg-subtle p-4", className)}>
        <p className="text-center text-sm text-app-muted">
          No routing weights available. Deposits will go to the current chain.
        </p>
      </div>
    );
  }

  const totalEstimatedShares = estimateShares(totalAmount, sharePrice, depositFeeBps);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-app-text">Deposit Routing</span>
        <span className="text-app-muted">{formatUSDC(totalAmount)} USDC total</span>
      </div>
      
      <div className="space-y-2">
        {splits.map((split) => {
          const meta = getChainMeta(split.chainSelector);
          const Icon = meta.icon;
          const estimatedSharesForSplit = estimateShares(split.amount, sharePrice, depositFeeBps);
          
          return (
            <div
              key={split.chainId}
              className="flex items-center justify-between rounded-lg border border-app-border bg-app-bg-subtle p-3"
            >
              <div className="flex items-center gap-3">
                <Icon size={24} />
                <div>
                  <p className="text-sm font-medium text-app-text">{meta.name}</p>
                  <p className="text-xs text-app-muted">{split.percentage.toFixed(1)}% allocation</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-app-text">{formatUSDC(split.amount)} USDC</p>
                <p className="text-xs text-app-muted">~{formatShares(estimatedSharesForSplit)} shares</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-md border border-app-border bg-app-bg-subtle p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-app-muted">Total estimated shares</span>
          <span className="font-semibold text-app-text">{formatShares(totalEstimatedShares)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-sm">
          <span className="text-app-muted">Deposit fee</span>
          <span className="text-app-text">{Number(depositFeeBps) / 100}%</span>
        </div>
      </div>

      <div className="mt-2 rounded-md border border-app-accent/20 bg-app-accent/5 p-3">
        <p className="text-xs leading-relaxed text-app-muted">
          Your deposit will be automatically split across {splits.length} chain{splits.length > 1 ? "s" : ""} based on 
          current routing weights. Each chain transaction will be executed in parallel for fastest completion.
        </p>
      </div>
    </div>
  );
}

interface RoutingBarProps {
  splits: RoutingSplit[];
  className?: string;
}

export function RoutingBar({ splits, className }: RoutingBarProps) {
  if (splits.length === 0) return null;

  return (
    <div className={cn("flex h-2 overflow-hidden rounded-full", className)}>
      {splits.map((split, index) => {
        const meta = getChainMeta(split.chainSelector);
        return (
          <div
            key={split.chainId}
            className="transition-all duration-300"
            style={{
              width: `${split.percentage}%`,
              backgroundColor: meta.color,
              marginLeft: index > 0 ? "1px" : undefined,
            }}
            title={`${meta.name}: ${split.percentage.toFixed(1)}%`}
          />
        );
      })}
    </div>
  );
}
