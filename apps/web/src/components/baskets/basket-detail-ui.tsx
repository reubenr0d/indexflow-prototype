"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Coins,
  Gauge,
  Layers3,
  MinusCircle,
  PlusCircle,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { InfoLabel } from "@/components/ui/info-tooltip";
import { cn } from "@/lib/utils";
import {
  formatAssetId,
  formatBps,
  formatRelativeTime,
  formatSignedUsd1e30,
  formatUSDC,
  formatUsd1e30,
  type ExposureDirection,
} from "@/lib/format";
import type { TooltipKey } from "@/lib/tooltip-copy";

export type BasketHistoryRow = {
  id: string;
  activityType: string;
  timestamp: bigint;
  txHash: `0x${string}`;
  amountUsdc?: bigint;
  size?: bigint;
  pnl?: bigint;
  assetId?: `0x${string}`;
  isLong?: boolean;
};

export type HistoryActivityMeta = {
  title: string;
  detail?: string;
  icon: LucideIcon;
  tone: "accent" | "success" | "danger" | "muted" | "warning";
};

type Tone = HistoryActivityMeta["tone"];

export function SectionHeader({
  icon: Icon,
  title,
  meta,
  action,
  className,
}: {
  icon: LucideIcon;
  title: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-app-border bg-app-bg-subtle text-app-text">
            <Icon className="h-4 w-4" />
          </span>
          <h3 className="text-base font-semibold text-app-text">{title}</h3>
        </div>
        {meta && <div className="mt-1 pl-10 text-xs text-app-muted">{meta}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function MetricTile({
  icon: Icon,
  label,
  value,
  subValue,
  tooltipKey,
  className,
}: {
  icon: LucideIcon;
  label: ReactNode;
  value: string;
  subValue?: ReactNode;
  tooltipKey?: TooltipKey;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-app-border bg-app-surface p-4 shadow-[var(--shadow)] transition-colors hover:border-app-border-strong hover:bg-app-surface-hover",
        className
      )}
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-app-muted">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-app-bg-subtle text-app-text">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <InfoLabel label={label} tooltipKey={tooltipKey} />
      </div>
      <div className="mt-3 font-mono text-2xl font-semibold tracking-tight text-app-text">{value}</div>
      {subValue && <div className="mt-1 text-xs text-app-muted">{subValue}</div>}
    </div>
  );
}

export function StatusChip({
  icon: Icon,
  label,
  tone,
  className,
}: {
  icon: LucideIcon;
  label: string;
  tone: Tone;
  className?: string;
}) {
  const toneClass =
    tone === "success"
      ? "border-app-success/25 bg-app-success/10 text-app-success"
      : tone === "danger"
        ? "border-app-danger/25 bg-app-danger/10 text-app-danger"
        : tone === "warning"
          ? "border-app-warning/25 bg-app-warning/10 text-app-warning"
          : tone === "muted"
            ? "border-app-border bg-app-bg-subtle text-app-muted"
            : "border-app-accent/25 bg-app-accent/10 text-app-accent";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide",
        toneClass,
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

export function ActivityBadge({
  meta,
}: {
  meta: HistoryActivityMeta;
}) {
  const toneClass =
    meta.tone === "success"
      ? "border-app-success/20 bg-app-success/10 text-app-success"
      : meta.tone === "danger"
        ? "border-app-danger/20 bg-app-danger/10 text-app-danger"
        : meta.tone === "warning"
          ? "border-app-warning/20 bg-app-warning/10 text-app-warning"
          : meta.tone === "muted"
            ? "border-app-border bg-app-bg-subtle text-app-muted"
            : "border-app-accent/20 bg-app-accent/10 text-app-accent";

  return (
    <span
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-md border",
        toneClass
      )}
    >
      <meta.icon className="h-4 w-4" />
    </span>
  );
}

function getToneForDirection(direction: ExposureDirection): Tone {
  if (direction === "Long") return "success";
  if (direction === "Short") return "danger";
  return "muted";
}

function formatActivityAmount(row: BasketHistoryRow): string | undefined {
  if (row.amountUsdc !== undefined) return formatUSDC(row.amountUsdc);
  if (row.size !== undefined) return formatUsd1e30(row.size);
  if (row.pnl !== undefined) return formatSignedUsd1e30(row.pnl);
  return undefined;
}

function positionSideLabel(row: BasketHistoryRow): string | undefined {
  if (row.isLong === true) return "long";
  if (row.isLong === false) return "short";
  return undefined;
}

export function getBasketActivityMeta(row: BasketHistoryRow): HistoryActivityMeta {
  const amount = formatActivityAmount(row);
  const asset = row.assetId ? formatAssetId(row.assetId) : undefined;
  const direction = row.isLong === true ? "Long" : row.isLong === false ? "Short" : "Flat";

  switch (row.activityType) {
    case "deposit":
      return {
        title: "Deposited",
        detail: amount ? `${amount} USDC` : "USDC",
        icon: ArrowDownToLine,
        tone: "success",
      };
    case "redeem":
      return {
        title: "Redeemed",
        detail: amount ? `${amount} USDC` : "USDC",
        icon: ArrowUpFromLine,
        tone: "danger",
      };
    case "allocateToPerp":
      return {
        title: "Allocated to perp",
        detail: amount ? `${amount} routed` : "Capital routed",
        icon: TrendingUp,
        tone: "accent",
      };
    case "withdrawFromPerp":
      return {
        title: "Withdrew from perp",
        detail: amount ? `${amount} returned` : "Capital returned",
        icon: TrendingDown,
        tone: "warning",
      };
    case "positionOpened":
      return {
        title: row.isLong === undefined ? "Opened position" : `Opened ${positionSideLabel(row)} position`,
        detail: [asset, amount ? `${amount} size` : undefined, row.amountUsdc !== undefined ? `${formatUSDC(row.amountUsdc)} collateral` : undefined]
          .filter(Boolean)
          .join(" · "),
        icon: PlusCircle,
        tone: getToneForDirection(direction),
      };
    case "positionClosed":
      return {
        title: row.isLong === undefined ? "Closed position" : `Closed ${positionSideLabel(row)} position`,
        detail: [asset, row.pnl !== undefined ? `${formatSignedUsd1e30(row.pnl)} PnL` : undefined]
          .filter(Boolean)
          .join(" · "),
        icon: MinusCircle,
        tone: "muted",
      };
    case "pnlRealized":
      return {
        title: "Realized PnL",
        detail: amount ? `${amount} booked` : "PnL booked",
        icon: Activity,
        tone: amount && row.pnl && row.pnl > 0n ? "success" : "warning",
      };
    case "feesCollected":
      return {
        title: "Collected fees",
        detail: amount ? `${amount} collected` : "Fees collected",
        icon: Coins,
        tone: "accent",
      };
    case "reserveTopUp":
      return {
        title: "Topped up reserve",
        detail: amount ? `${amount} added` : "Reserve replenished",
        icon: Wallet,
        tone: "success",
      };
    case "reservePolicyUpdated":
      return {
        title: "Updated reserve policy",
        detail: row.amountUsdc !== undefined ? `${formatBps(row.amountUsdc)} target` : "Policy updated",
        icon: ShieldCheck,
        tone: "warning",
      };
    case "vaultRegistered":
      return {
        title: "Vault registered",
        detail: "Activated in VaultAccounting",
        icon: ShieldCheck,
        tone: "success",
      };
    case "vaultDeregistered":
      return {
        title: "Vault deregistered",
        detail: "Removed from VaultAccounting",
        icon: ShieldAlert,
        tone: "danger",
      };
    case "assetsUpdated":
      return {
        title: "Assets updated",
        detail: "Basket composition refreshed",
        icon: Layers3,
        tone: "accent",
      };
    case "capitalDeposited":
      return {
        title: "Capital deposited",
        detail: amount ? `${amount} moved to accounting` : "Capital moved",
        icon: ArrowDownToLine,
        tone: "success",
      };
    case "capitalWithdrawn":
      return {
        title: "Capital withdrawn",
        detail: amount ? `${amount} moved back` : "Capital moved back",
        icon: ArrowUpFromLine,
        tone: "warning",
      };
    case "maxOpenInterestSet":
      return {
        title: "Set max open interest",
        detail: amount ? `${amount} cap` : "Cap updated",
        icon: Gauge,
        tone: "warning",
      };
    case "maxPositionSizeSet":
      return {
        title: "Set max position size",
        detail: amount ? `${amount} cap` : "Cap updated",
        icon: Gauge,
        tone: "warning",
      };
    default:
      return {
        title: row.activityType.replace(/([a-z])([A-Z])/g, "$1 $2"),
        detail:
          amount ??
          (row.assetId ? formatAssetId(row.assetId) : undefined) ??
          "Activity recorded",
        icon: Activity,
        tone: "muted",
      };
  }
}

export function groupHistoryRowsByDay(rows: BasketHistoryRow[]) {
  const sorted = [...rows].sort((a, b) => Number(b.timestamp - a.timestamp));
  const groups: Array<{ key: string; label: string; rows: BasketHistoryRow[]; timestamp: bigint }> = [];

  for (const row of sorted) {
    const date = new Date(Number(row.timestamp) * 1000);
    const key = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
    const label = date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.rows.push(row);
    } else {
      groups.push({ key, label, rows: [row], timestamp: row.timestamp });
    }
  }

  return groups;
}

export function formatHistoryTime(timestamp: bigint): string {
  return formatRelativeTime(Number(timestamp));
}

export function formatHistoryLabel(row: BasketHistoryRow): string {
  const meta = getBasketActivityMeta(row);
  const amount = formatActivityAmount(row);
  if (amount && ["deposit", "redeem", "allocateToPerp", "withdrawFromPerp", "feesCollected", "reserveTopUp", "capitalDeposited", "capitalWithdrawn"].includes(row.activityType)) {
    return `${meta.title} ${amount}`;
  }
  return meta.title;
}
