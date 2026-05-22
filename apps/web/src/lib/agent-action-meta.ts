import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Landmark,
  Layers3,
  Link2,
  MinusCircle,
  PlusCircle,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  formatAssetId,
  formatBps,
  formatUSDC,
  formatUsd1e30,
} from "@/lib/format";
import type { AgentAction, AgentActionParams } from "@/hooks/useAgentMetadata";

export type ActionTone = "accent" | "success" | "danger" | "muted" | "warning";

export type ActionMeta = {
  icon: LucideIcon;
  label: string;
  tone: ActionTone;
};

export type ActionChip = {
  label: string;
  mono?: boolean;
  tone?: ActionTone;
};

export function humanizeToolName(tool: string): string {
  if (!tool) return "";
  return tool
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getActionMeta(
  tool: string,
  params?: AgentActionParams,
): ActionMeta {
  switch (tool) {
    case "create_vault":
      return { icon: Landmark, label: "Created vault", tone: "accent" };
    case "wire_asset":
      return { icon: Link2, label: "Wired asset", tone: "warning" };
    case "set_vault_assets":
      return { icon: Layers3, label: "Set vault assets", tone: "accent" };
    case "allocate_to_perp":
      return { icon: TrendingUp, label: "Allocated to perp", tone: "accent" };
    case "withdraw_from_perp":
      return {
        icon: TrendingDown,
        label: "Withdrew from perp",
        tone: "warning",
      };
    case "open_position": {
      const isLong =
        params?.kind === "open_position" ? params.isLong : undefined;
      const label =
        isLong === true
          ? "Opened long"
          : isLong === false
            ? "Opened short"
            : "Opened position";
      const tone: ActionTone =
        isLong === true
          ? "success"
          : isLong === false
            ? "danger"
            : "accent";
      return { icon: PlusCircle, label, tone };
    }
    case "close_position": {
      const isLong =
        params?.kind === "close_position" ? params.isLong : undefined;
      const label =
        isLong === true
          ? "Closed long"
          : isLong === false
            ? "Closed short"
            : "Closed position";
      return { icon: MinusCircle, label, tone: "muted" };
    }
    default:
      return { icon: Activity, label: humanizeToolName(tool), tone: "muted" };
  }
}

export function getToneTileClass(tone: ActionTone): string {
  switch (tone) {
    case "success":
      return "border-app-success/20 bg-app-success/10 text-app-success";
    case "danger":
      return "border-app-danger/20 bg-app-danger/10 text-app-danger";
    case "warning":
      return "border-app-warning/20 bg-app-warning/10 text-app-warning";
    case "muted":
      return "border-app-border bg-app-bg-subtle text-app-muted";
    default:
      return "border-app-accent/20 bg-app-accent/10 text-app-accent";
  }
}

export function getToneChipClass(tone: ActionTone): string {
  switch (tone) {
    case "success":
      return "border-app-success/20 bg-app-success/10 text-app-success";
    case "danger":
      return "border-app-danger/20 bg-app-danger/10 text-app-danger";
    case "warning":
      return "border-app-warning/20 bg-app-warning/10 text-app-warning";
    case "muted":
      return "border-app-border bg-app-bg-subtle text-app-muted";
    default:
      return "border-app-accent/25 bg-app-accent/10 text-app-accent";
  }
}

function safeBigInt(value: string): bigint | null {
  if (!value) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function formatLeverage(size: string, collateral: string): string | null {
  const sizeBn = safeBigInt(size);
  const collBn = safeBigInt(collateral);
  if (!sizeBn || !collBn || collBn === 0n) return null;
  // size is in GMX USD 1e30, collateral is in raw USDC (6 decimals).
  // leverage = (size / 1e30) / (collateral / 1e6) = size / collateral / 1e24
  // Compute leverage * 100 to keep 2 decimal places, then format.
  const lev100 = (sizeBn * 100n) / (collBn * 10n ** 24n);
  if (lev100 <= 0n) return null;
  const whole = lev100 / 100n;
  const frac = lev100 % 100n;
  if (frac === 0n) return `${whole}x`;
  return `${whole}.${frac.toString().padStart(2, "0").replace(/0+$/, "")}x`;
}

export function renderActionChips(action: AgentAction): ActionChip[] {
  const params = action.params;
  if (!params) return [];

  switch (params.kind) {
    case "wire_asset": {
      const chips: ActionChip[] = [
        { label: params.symbol, mono: true, tone: "accent" },
      ];
      if (typeof params.seedPriceUsd === "number") {
        chips.push({
          label: `$${params.seedPriceUsd.toFixed(2)} seed`,
        });
      }
      return chips;
    }
    case "create_vault": {
      const chips: ActionChip[] = [
        { label: params.name, mono: true, tone: "accent" },
        { label: `${formatBps(params.depositFeeBps)} deposit` },
        { label: `${formatBps(params.redeemFeeBps)} redeem` },
      ];
      if (params.deployToSpokes === false) {
        chips.push({ label: "Hub only", tone: "muted" });
      } else if (params.deployToSpokes === true) {
        chips.push({ label: "Multi-chain", tone: "accent" });
      }
      return chips;
    }
    case "set_vault_assets":
      return [
        { label: `${params.count} asset${params.count === 1 ? "" : "s"}` },
      ];
    case "allocate_to_perp":
    case "withdraw_from_perp": {
      const amount = safeBigInt(params.amountUsdc);
      if (!amount) return [];
      return [
        {
          label: `${formatUSDC(amount)} USDC`,
          mono: true,
          tone: params.kind === "allocate_to_perp" ? "accent" : "warning",
        },
      ];
    }
    case "open_position": {
      const chips: ActionChip[] = [
        { label: formatAssetId(params.assetId), mono: true, tone: "accent" },
        {
          label: params.isLong ? "Long" : "Short",
          tone: params.isLong ? "success" : "danger",
        },
      ];
      const sizeBn = safeBigInt(params.size);
      if (sizeBn && sizeBn > 0n) {
        chips.push({ label: `${formatUsd1e30(sizeBn)} size`, mono: true });
      }
      const collBn = safeBigInt(params.collateral);
      if (collBn && collBn > 0n) {
        chips.push({
          label: `${formatUSDC(collBn)} collateral`,
          mono: true,
        });
      }
      const lev = formatLeverage(params.size, params.collateral);
      if (lev) {
        chips.push({ label: `${lev} leverage`, mono: true });
      }
      return chips;
    }
    case "close_position": {
      const chips: ActionChip[] = [
        { label: formatAssetId(params.assetId), mono: true, tone: "accent" },
        {
          label: params.isLong ? "Long" : "Short",
          tone: params.isLong ? "success" : "danger",
        },
      ];
      const sizeBn = safeBigInt(params.sizeDelta);
      if (sizeBn && sizeBn > 0n) {
        chips.push({
          label: `${formatUsd1e30(sizeBn)} closed`,
          mono: true,
        });
      }
      const collBn = safeBigInt(params.collateralDelta);
      if (collBn && collBn > 0n) {
        chips.push({
          label: `${formatUSDC(collBn)} freed`,
          mono: true,
        });
      }
      return chips;
    }
    default:
      return [];
  }
}
