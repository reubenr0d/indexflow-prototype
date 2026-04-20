"use client";

import { CheckCircle2, Loader2, XCircle, ArrowRightLeft, ShieldCheck, ArrowDownToLine } from "lucide-react";
import { getChainMeta } from "@/components/chains/chain-icons";
import { formatUSDC } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ChainTxStatus } from "@/hooks/useParallelChainDeposits";

interface ChainDepositRowProps {
  chainId: number;
  chainSelector: bigint;
  chainName: string;
  amount: bigint;
  percentage: number;
  status: ChainTxStatus;
  approveTxHash?: `0x${string}`;
  depositTxHash?: `0x${string}`;
  error?: string;
}

function getStatusIcon(status: ChainTxStatus) {
  switch (status) {
    case "idle":
      return <div className="h-4 w-4 rounded-full border-2 border-app-muted" />;
    case "switching":
      return <ArrowRightLeft className="h-4 w-4 animate-pulse text-app-accent" />;
    case "approving":
      return <ShieldCheck className="h-4 w-4 animate-pulse text-app-accent" />;
    case "depositing":
      return <Loader2 className="h-4 w-4 animate-spin text-app-accent" />;
    case "success":
      return <CheckCircle2 className="h-4 w-4 text-app-success" />;
    case "error":
      return <XCircle className="h-4 w-4 text-app-danger" />;
  }
}

function getStatusLabel(status: ChainTxStatus): string {
  switch (status) {
    case "idle":
      return "Pending";
    case "switching":
      return "Switching chain...";
    case "approving":
      return "Approving USDC...";
    case "depositing":
      return "Depositing...";
    case "success":
      return "Complete";
    case "error":
      return "Failed";
  }
}

function getStatusTone(status: ChainTxStatus): string {
  switch (status) {
    case "idle":
      return "text-app-muted";
    case "switching":
    case "approving":
    case "depositing":
      return "text-app-accent";
    case "success":
      return "text-app-success";
    case "error":
      return "text-app-danger";
  }
}

export function ChainDepositRow({
  chainId,
  chainSelector,
  amount,
  percentage,
  status,
  approveTxHash,
  depositTxHash,
  error,
}: ChainDepositRowProps) {
  const meta = getChainMeta(chainSelector);
  const Icon = meta.icon;
  const isActive = status !== "idle" && status !== "success" && status !== "error";

  return (
    <div
      className={cn(
        "rounded-lg border bg-app-bg-subtle p-3 transition-all",
        isActive ? "border-app-accent/50 ring-1 ring-app-accent/20" : "border-app-border",
        status === "success" && "border-app-success/30 bg-app-success/5",
        status === "error" && "border-app-danger/30 bg-app-danger/5"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Icon size={28} />
            <div className="absolute -bottom-1 -right-1 rounded-full bg-app-surface p-0.5">
              {getStatusIcon(status)}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-app-text">{meta.name}</p>
            <p className={cn("text-xs", getStatusTone(status))}>
              {getStatusLabel(status)}
            </p>
          </div>
        </div>
        
        <div className="text-right">
          <p className="text-sm font-semibold text-app-text">{formatUSDC(amount)} USDC</p>
          <p className="text-xs text-app-muted">{percentage.toFixed(1)}%</p>
        </div>
      </div>

      {(status === "approving" || status === "depositing" || status === "success") && (
        <div className="mt-3 flex items-center gap-4 border-t border-app-border pt-3">
          <StepIndicator
            label="Approve"
            status={
              status === "approving"
                ? "active"
                : approveTxHash || status === "depositing" || status === "success"
                  ? "complete"
                  : "pending"
            }
            txHash={approveTxHash}
            chainId={chainId}
          />
          <div className="h-px flex-1 bg-app-border" />
          <StepIndicator
            label="Deposit"
            status={
              status === "depositing"
                ? "active"
                : status === "success"
                  ? "complete"
                  : "pending"
            }
            txHash={depositTxHash}
            chainId={chainId}
          />
        </div>
      )}

      {error && (
        <div className="mt-2 rounded-md bg-app-danger/10 px-2 py-1">
          <p className="text-xs text-app-danger">{error}</p>
        </div>
      )}
    </div>
  );
}

interface StepIndicatorProps {
  label: string;
  status: "pending" | "active" | "complete";
  txHash?: `0x${string}`;
  chainId: number;
}

function StepIndicator({ label, status, txHash }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-1.5">
      {status === "active" && <Loader2 className="h-3 w-3 animate-spin text-app-accent" />}
      {status === "complete" && <CheckCircle2 className="h-3 w-3 text-app-success" />}
      {status === "pending" && <div className="h-3 w-3 rounded-full border border-app-muted" />}
      <span
        className={cn(
          "text-xs",
          status === "active" && "text-app-accent",
          status === "complete" && "text-app-success",
          status === "pending" && "text-app-muted"
        )}
      >
        {label}
      </span>
      {txHash && (
        <span className="ml-1 text-xs text-app-muted">
          ({txHash.slice(0, 6)}...)
        </span>
      )}
    </div>
  );
}

interface ChainDepositListProps {
  statuses: ChainDepositRowProps[];
  className?: string;
}

export function ChainDepositList({ statuses, className }: ChainDepositListProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {statuses.map((status) => (
        <ChainDepositRow key={status.chainId} {...status} />
      ))}
    </div>
  );
}
