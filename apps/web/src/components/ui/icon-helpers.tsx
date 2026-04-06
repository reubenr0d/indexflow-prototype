import { ArrowDownToLine, ArrowUpToLine, CheckCircle2, CircleAlert, Clock3, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { type ReactNode } from "react";
import type { StatusChipTone } from "./status-chip";

export type PanelMode = "deposit" | "redeem";
export type PanelAction = "approve" | "deposit" | "redeem";
export type PanelPhase = "idle" | "pending" | "confirmed" | "failed";

interface PanelPrimaryActionMeta {
  label: string;
  icon: ReactNode;
  tone: StatusChipTone;
}

interface PanelStatusMeta {
  label: string;
  icon: ReactNode;
  tone: StatusChipTone;
}

function getStatusActionLabel(action: PanelAction | null): string {
  if (action === "approve") return "Approval";
  if (action === "deposit") return "Deposit";
  if (action === "redeem") return "Redemption";
  return "Action";
}

export function getPanelPrimaryActionMeta({
  hasAddress,
  mode,
  needsApproval,
  isProcessing,
}: {
  hasAddress: boolean;
  mode: PanelMode;
  needsApproval: boolean;
  isProcessing: boolean;
}): PanelPrimaryActionMeta {
  if (!hasAddress) {
    return {
      label: "Connect Wallet",
      icon: <Wallet className="h-4 w-4" />,
      tone: "neutral",
    };
  }

  if (isProcessing) {
    return {
      label: "Processing...",
      icon: <Loader2 className="h-4 w-4 animate-spin" />,
      tone: "accent",
    };
  }

  if (mode === "deposit" && needsApproval) {
    return {
      label: "Approve USDC",
      icon: <ShieldCheck className="h-4 w-4" />,
      tone: "accent",
    };
  }

  if (mode === "deposit") {
    return {
      label: "Deposit",
      icon: <ArrowDownToLine className="h-4 w-4" />,
      tone: "accent",
    };
  }

  return {
    label: "Redeem",
    icon: <ArrowUpToLine className="h-4 w-4" />,
    tone: "warning",
  };
}

export function getPanelStatusMeta(phase: PanelPhase, action: PanelAction | null): PanelStatusMeta {
  const actionLabel = getStatusActionLabel(action);

  if (phase === "pending") {
    return {
      label: `${actionLabel} pending`,
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
      tone: "accent",
    };
  }

  if (phase === "confirmed") {
    return {
      label: `${actionLabel} confirmed`,
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      tone: "success",
    };
  }

  if (phase === "failed") {
    return {
      label: `${actionLabel} failed`,
      icon: <CircleAlert className="h-3.5 w-3.5" />,
      tone: "danger",
    };
  }

  return {
    label: "Ready",
    icon: <Clock3 className="h-3.5 w-3.5" />,
    tone: "neutral",
  };
}

export function getPanelRailStepTone({
  phase,
  step,
  hasAmount,
}: {
  phase: PanelPhase;
  step: "quote" | "broadcast" | "confirm";
  hasAmount: boolean;
}): StatusChipTone {
  if (step === "quote") {
    return hasAmount ? "success" : "accent";
  }

  if (step === "broadcast") {
    if (phase === "pending") return "accent";
    if (phase === "confirmed") return "success";
    if (phase === "failed") return "danger";
    return "neutral";
  }

  if (step === "confirm") {
    if (phase === "confirmed") return "success";
    return "neutral";
  }

  return "neutral";
}
