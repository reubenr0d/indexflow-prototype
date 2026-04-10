"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatBps, formatUSDC, formatNetExposure1e30, type ExposureDirection } from "@/lib/format";
import type { BlendedComposition } from "@/lib/blendedComposition";
import { CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface CompositionSidebarProps {
  blended: BlendedComposition;
  assetMeta: Map<`0x${string}`, { name: string }>;
  reserveHealthy: boolean;
  idleUsdc: bigint;
  requiredReserve: bigint;
  collectedFeesUsdc: bigint;
  showComposition: boolean;
  className?: string;
}

function directionIcon(direction: ExposureDirection) {
  if (direction === "Long") return <ArrowUpRight className="h-3 w-3 text-app-success" />;
  if (direction === "Short") return <ArrowDownRight className="h-3 w-3 text-app-danger" />;
  return <Minus className="h-3 w-3 text-app-muted" />;
}

export function CompositionSidebar({
  blended,
  assetMeta,
  reserveHealthy,
  idleUsdc,
  requiredReserve,
  collectedFeesUsdc,
  showComposition,
  className,
}: CompositionSidebarProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Card className={cn("flex flex-col", className)}>
      {/* Reserve health indicator */}
      <div
        className={cn(
          "flex items-center gap-2 border-b border-app-border px-4 py-3",
          reserveHealthy ? "text-app-success" : "text-app-danger",
        )}
      >
        {reserveHealthy ? (
          <CheckCircle2 className="h-4 w-4 shrink-0" />
        ) : (
          <AlertTriangle className="h-4 w-4 shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-xs font-semibold">
            {reserveHealthy ? "Reserve Healthy" : "Reserve Below Target"}
          </p>
          <p className="truncate text-[10px] opacity-80">
            {formatUSDC(idleUsdc > 0n ? idleUsdc : 0n)} idle / {formatUSDC(requiredReserve)} required
          </p>
        </div>
      </div>

      {/* Fees */}
      <div className="flex items-center justify-between border-b border-app-border px-4 py-2.5 text-xs">
        <span className="text-app-muted">Collected Fees</span>
        <span className="font-mono font-semibold text-app-text">{formatUSDC(collectedFeesUsdc)}</span>
      </div>

      {/* Composition header (collapsible on mobile) */}
      <button
        className="flex w-full items-center justify-between px-4 py-3 lg:cursor-default"
        onClick={() => setExpanded((p) => !p)}
      >
        <span className="text-[10px] font-semibold uppercase tracking-widest text-app-muted">
          Composition
        </span>
        <span className="lg:hidden">
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-app-muted" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-app-muted" />
          )}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            {showComposition && blended.assetBlend.length > 0 ? (
              <div className="divide-y divide-app-border border-t border-app-border">
                {blended.assetBlend.map((a) => {
                  const meta = assetMeta.get(a.assetId);
                  const net = formatNetExposure1e30(a.netSize);
                  return (
                    <div key={a.assetId} className="flex items-center justify-between px-4 py-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {directionIcon(net.direction)}
                        <span className="truncate text-xs font-medium text-app-text">
                          {meta?.name ?? a.assetId.slice(0, 10)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-12 overflow-hidden rounded-full bg-app-bg-subtle">
                          <div
                            className="h-full rounded-full bg-app-accent"
                            style={{ width: `${Math.min(Number(a.blendBps) / 100, 100)}%` }}
                          />
                        </div>
                        <span className="w-12 text-right font-mono text-[11px] text-app-muted">
                          {formatBps(a.blendBps)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="border-t border-app-border px-4 py-4 text-center text-xs text-app-muted">
                No active composition
              </p>
            )}

            {/* Perp exposure total */}
            <div className="flex items-center justify-between border-t border-app-border px-4 py-2.5 text-xs">
              <span className="text-app-muted">Perp Exposure</span>
              <span className="font-mono font-semibold text-app-text">
                {formatBps(showComposition ? blended.perpBlendBps : 0n)}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
