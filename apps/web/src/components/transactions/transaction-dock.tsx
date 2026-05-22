"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronUp,
  ExternalLink,
  Loader2,
  X,
  XCircle,
  RotateCw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  useOptionalTransactionStatus,
  type TxRecord,
  type TxStatus,
  type TransactionStatusContextValue,
} from "@/providers/TransactionStatusProvider";
import { getChainMeta } from "@/components/chains/chain-icons";

const MAX_MINI_CARDS = 3;
const SUCCESS_LINGER_MS = 4_000;

function statusIcon(status: TxStatus, size: "sm" | "md" = "sm") {
  const cls = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  switch (status) {
    case "signing":
    case "submitted":
      return <Loader2 className={cn(cls, "animate-spin text-app-accent")} />;
    case "confirmed":
      return <CheckCircle2 className={cn(cls, "text-app-success")} />;
    case "failed":
      return <XCircle className={cn(cls, "text-app-danger")} />;
  }
}

function statusLabel(record: TxRecord): string {
  switch (record.status) {
    case "signing":
      return "Signing";
    case "submitted":
      return "Submitted";
    case "confirmed":
      return record.kind === "multi-chain-deposit"
        ? "All deposits confirmed"
        : "Confirmed";
    case "failed":
      return "Failed";
  }
}

function statusTone(status: TxStatus): string {
  switch (status) {
    case "signing":
    case "submitted":
      return "text-app-accent";
    case "confirmed":
      return "text-app-success";
    case "failed":
      return "text-app-danger";
  }
}

function chainBadge(chainId?: number) {
  if (!chainId) return null;
  const meta = getChainMeta(chainId.toString());
  const Icon = meta.icon;
  return <Icon size={20} />;
}

export function TransactionDock() {
  const tx = useOptionalTransactionStatus();
  const [expanded, setExpanded] = useState(false);

  // Auto-dismiss confirmed records after the linger window so the dock
  // self-cleans (Rainbow-style). Failed records persist until manually
  // dismissed or retried.
  useEffect(() => {
    if (!tx) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const record of tx.records) {
      if (record.status === "confirmed") {
        const elapsed = Date.now() - record.updatedAt;
        const wait = Math.max(SUCCESS_LINGER_MS - elapsed, 0);
        timers.push(
          setTimeout(() => tx.dismissTx(record.id), wait)
        );
      }
    }
    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, [tx]);

  if (!tx) return null;
  const visibleRecords = tx.records;
  if (visibleRecords.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-end px-4 sm:px-6"
      data-testid="transaction-dock"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto w-full max-w-[360px]">
        <AnimatePresence initial={false} mode="popLayout">
          {expanded ? (
            <ExpandedView
              key="expanded"
              records={visibleRecords}
              onCollapse={() => setExpanded(false)}
              tx={tx}
            />
          ) : (
            <CollapsedStack
              key="collapsed"
              records={visibleRecords}
              onExpand={() => setExpanded(true)}
              tx={tx}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

interface CollapsedStackProps {
  records: TxRecord[];
  onExpand: () => void;
  tx: TransactionStatusContextValue;
}

function CollapsedStack({ records, onExpand, tx }: CollapsedStackProps) {
  // Show the most recent records first, capped at MAX_MINI_CARDS.
  const sorted = useMemo(
    () => [...records].sort((a, b) => b.updatedAt - a.updatedAt),
    [records]
  );
  const visible = sorted.slice(0, MAX_MINI_CARDS);
  const overflow = sorted.length - visible.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ type: "spring", stiffness: 360, damping: 30 }}
      className="flex flex-col items-end gap-2"
      data-state="collapsed"
    >
      {overflow > 0 && (
        <button
          type="button"
          onClick={onExpand}
          className="rounded-full border border-app-border bg-app-surface px-3 py-1 text-[11px] font-semibold text-app-muted shadow-[var(--shadow)] transition-colors hover:bg-app-bg-subtle"
        >
          +{overflow} more
        </button>
      )}
      <AnimatePresence initial={false}>
        {visible.map((record) => (
          <motion.div
            key={record.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
            className="w-full"
          >
            <MiniCard record={record} onExpand={onExpand} tx={tx} />
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

interface MiniCardProps {
  record: TxRecord;
  onExpand: () => void;
  tx: TransactionStatusContextValue;
}

function MiniCard({ record, onExpand, tx }: MiniCardProps) {
  const explorerUrl =
    record.hash && record.chainId
      ? tx.getExplorerUrl(record.chainId, record.hash)
      : undefined;
  const failed = record.status === "failed";

  return (
    <div
      data-testid="transaction-dock-card"
      data-status={record.status}
      data-tx-id={record.id}
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-app-surface px-3 py-2.5 shadow-[var(--shadow)] transition-colors",
        "border-app-border",
        failed && "border-app-danger/40",
        record.status === "confirmed" && "border-app-success/30"
      )}
    >
      <button
        type="button"
        onClick={onExpand}
        className="flex flex-1 items-center gap-3 text-left focus:outline-none"
        aria-label={`${statusLabel(record)} – ${record.label}`}
      >
        <div className="relative shrink-0">
          {chainBadge(record.chainId) ?? (
            <div className="h-5 w-5 rounded-full bg-app-bg-subtle" />
          )}
          <div className="absolute -bottom-1 -right-1 rounded-full bg-app-surface p-0.5">
            {statusIcon(record.status, "sm")}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-app-text">
            {record.label}
          </p>
          <p className={cn("text-[11px] leading-tight", statusTone(record.status))}>
            {statusLabel(record)}
            {record.kind === "multi-chain-deposit" && record.children
              ? ` · ${record.children.filter((c) => c.status === "confirmed").length}/${record.children.length} chains`
              : ""}
          </p>
        </div>
        <ChevronUp className="h-3.5 w-3.5 text-app-muted" aria-hidden />
      </button>
      <div className="flex items-center gap-1">
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-md p-1 text-app-muted transition-colors hover:bg-app-bg-subtle hover:text-app-text"
            aria-label="View on explorer"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        {(record.status === "confirmed" || failed) && (
          <button
            type="button"
            onClick={() => tx.dismissTx(record.id)}
            className="rounded-md p-1 text-app-muted transition-colors hover:bg-app-bg-subtle hover:text-app-text"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

interface ExpandedViewProps {
  records: TxRecord[];
  onCollapse: () => void;
  tx: TransactionStatusContextValue;
}

function ExpandedView({ records, onCollapse, tx }: ExpandedViewProps) {
  const sorted = useMemo(
    () => [...records].sort((a, b) => b.updatedAt - a.updatedAt),
    [records]
  );
  const hasCompleted = sorted.some(
    (r) => r.status === "confirmed" || r.status === "failed"
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 360, damping: 30 }}
      className="overflow-hidden rounded-2xl border border-app-border bg-app-surface shadow-[var(--shadow)]"
      data-state="expanded"
    >
      <div className="flex items-center justify-between border-b border-app-border px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-app-text">Transactions</p>
          <p className="text-[11px] text-app-muted">
            {tx.inFlightCount > 0
              ? `${tx.inFlightCount} in flight`
              : "All caught up"}
          </p>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          className="rounded-md p-1.5 text-app-muted transition-colors hover:bg-app-bg-subtle hover:text-app-text"
          aria-label="Collapse"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto px-2 py-2">
        <ul className="space-y-1.5">
          {sorted.map((record) => (
            <li key={record.id}>
              <ExpandedRow record={record} tx={tx} />
            </li>
          ))}
        </ul>
      </div>
      {hasCompleted && (
        <div className="flex items-center justify-between border-t border-app-border px-4 py-2">
          <span className="text-[11px] text-app-muted">
            Completed rows auto-clear after a few seconds.
          </span>
          <button
            type="button"
            onClick={tx.clearCompleted}
            className="text-[11px] font-medium text-app-accent hover:underline"
          >
            Clear completed
          </button>
        </div>
      )}
    </motion.div>
  );
}

interface ExpandedRowProps {
  record: TxRecord;
  tx: TransactionStatusContextValue;
}

function ExpandedRow({ record, tx }: ExpandedRowProps) {
  const explorerUrl =
    record.hash && record.chainId
      ? tx.getExplorerUrl(record.chainId, record.hash)
      : undefined;
  const failed = record.status === "failed";

  return (
    <div
      data-testid="transaction-dock-row"
      data-status={record.status}
      data-tx-id={record.id}
      className={cn(
        "rounded-lg border bg-app-bg-subtle p-3",
        "border-app-border",
        failed && "border-app-danger/40 bg-app-danger/5",
        record.status === "confirmed" && "border-app-success/30 bg-app-success/5"
      )}
    >
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          {chainBadge(record.chainId) ?? (
            <div className="h-5 w-5 rounded-full bg-app-bg-subtle" />
          )}
          <div className="absolute -bottom-1 -right-1 rounded-full bg-app-surface p-0.5">
            {statusIcon(record.status, "sm")}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-app-text">
            {record.label}
          </p>
          <p className={cn("text-[11px]", statusTone(record.status))}>
            {statusLabel(record)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md p-1 text-app-muted transition-colors hover:bg-app-bg-subtle hover:text-app-text"
              aria-label="View on explorer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {failed && record.meta?.onRetry && (
            <button
              type="button"
              onClick={() => record.meta?.onRetry?.()}
              className="inline-flex items-center gap-1 rounded-md border border-app-border bg-app-surface px-2 py-1 text-[11px] font-medium text-app-text transition-colors hover:bg-app-bg-subtle"
            >
              <RotateCw className="h-3 w-3" />
              Retry
            </button>
          )}
          {(record.status === "confirmed" || failed) && (
            <button
              type="button"
              onClick={() => tx.dismissTx(record.id)}
              className="rounded-md p-1 text-app-muted transition-colors hover:bg-app-bg-subtle hover:text-app-text"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {failed && record.error && (
        <p className="mt-2 break-words rounded-md bg-app-danger/10 px-2 py-1 text-[11px] text-app-danger">
          {record.error}
        </p>
      )}
      {record.children && record.children.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-app-border pt-3">
          {record.children.map((child) => {
            const childExplorer = child.hash
              ? tx.getExplorerUrl(child.chainId, child.hash)
              : undefined;
            return (
              <li
                key={child.id}
                data-testid="transaction-dock-child"
                data-status={child.status}
                className="flex items-center gap-3 text-xs"
              >
                <div className="shrink-0">
                  {chainBadge(child.chainId) ?? (
                    <div className="h-4 w-4 rounded-full bg-app-bg-subtle" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-app-text">{child.chainName}</p>
                  <p className={cn("text-[10px]", statusTone(child.status))}>
                    {statusLabel({
                      ...record,
                      status: child.status,
                      label: child.label,
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {statusIcon(child.status, "sm")}
                  {childExplorer && (
                    <a
                      href={childExplorer}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md p-1 text-app-muted transition-colors hover:bg-app-bg-subtle hover:text-app-text"
                      aria-label="View on explorer"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
