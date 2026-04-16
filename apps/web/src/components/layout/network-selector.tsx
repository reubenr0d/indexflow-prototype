"use client";

import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { CONFIGURED_DEPLOYMENT_TARGETS } from "@/config/contracts";
import {
  deploymentLabel,
  getSubgraphUrlForTarget,
  type DeploymentTarget,
} from "@/lib/deployment";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Diamond, Hammer, Globe, Layers, Mountain, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const NETWORK_ICONS: Record<string, LucideIcon> = {
  anvil: Hammer,
  local: Hammer,
  sepolia: Diamond,
  "arbitrum-sepolia": Diamond,
  arbitrum: Globe,
  fuji: Mountain,
};

function getNetworkIcon(target: string): LucideIcon {
  return NETWORK_ICONS[target] ?? Globe;
}

export function NetworkSelector() {
  const { target, setTarget, canSwitchTarget, isSubgraphEnabled, viewMode, setViewMode, configuredTargets } =
    useDeploymentTarget();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  if (!canSwitchTarget || CONFIGURED_DEPLOYMENT_TARGETS.length < 2) return null;

  const isAllChains = viewMode === "all";

  function handleSelectChain(t: DeploymentTarget) {
    setTarget(t);
    setOpen(false);
  }

  function handleSelectAll() {
    setViewMode("all");
    setOpen(false);
  }

  const TriggerIcon = isAllChains ? Layers : getNetworkIcon(target);
  const triggerLabel = isAllChains
    ? `All Chains (${configuredTargets.length})`
    : deploymentLabel(target);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
          "border-app-border bg-app-surface text-app-text hover:border-app-border-strong hover:bg-app-surface-hover"
        )}
      >
        <TriggerIcon className="h-4 w-4 text-app-muted" />
        <span>{triggerLabel}</span>
        {isSubgraphEnabled && (
          <span
            className="rounded bg-app-accent-dim px-1 py-px text-[10px] leading-none text-app-accent"
            title="Subgraph connected"
          >
            SG
          </span>
        )}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-app-muted transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 min-w-[12rem] overflow-hidden rounded-lg border border-app-border bg-app-surface shadow-xl">
          <div className="p-1">
            {/* All Chains option */}
            <button
              type="button"
              onClick={handleSelectAll}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                isAllChains
                  ? "bg-app-bg-subtle font-medium text-app-text"
                  : "text-app-muted hover:bg-app-surface-hover hover:text-app-text"
              )}
            >
              <Layers className="h-4 w-4 shrink-0" />
              <span className="flex-1">All Chains</span>
              <span className="rounded bg-app-accent-dim px-1 py-px text-[10px] leading-none text-app-accent">
                {configuredTargets.length}
              </span>
              {isAllChains && <Check className="h-3.5 w-3.5 shrink-0 text-app-accent" />}
            </button>

            <div className="my-1 border-t border-app-border" />

            {/* Per-chain options */}
            {CONFIGURED_DEPLOYMENT_TARGETS.map((t) => {
              const Icon = getNetworkIcon(t);
              const hasSg = getSubgraphUrlForTarget(t) !== null;
              const isActive = !isAllChains && t === target;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleSelectChain(t)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                    isActive
                      ? "bg-app-bg-subtle font-medium text-app-text"
                      : "text-app-muted hover:bg-app-surface-hover hover:text-app-text"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{deploymentLabel(t)}</span>
                  {hasSg && (
                    <span
                      className="rounded bg-app-accent-dim px-1 py-px text-[10px] leading-none text-app-accent"
                      title="Subgraph configured"
                    >
                      SG
                    </span>
                  )}
                  {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-app-accent" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
