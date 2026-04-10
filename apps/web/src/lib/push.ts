export type PushEventKey =
  | "depositConfirmed"
  | "redeemConfirmed"
  | "reserveBelowTarget"
  | "basketPaused"
  | "openInterestNearCap"
  | "oracleStale"
  | "largeRealizedPnl"
  | "riskConfigChanged";

export interface PushPreferences {
  masterEnabled: boolean;
  digestEnabled: boolean;
  events: Record<PushEventKey, boolean>;
}

export const PUSH_EVENT_LABELS: Record<PushEventKey, { label: string; hint: string; audience: "investor" | "operator" }> = {
  depositConfirmed: {
    label: "Deposit confirmed",
    hint: "Notify when a deposit transaction for your wallet confirms.",
    audience: "investor",
  },
  redeemConfirmed: {
    label: "Redeem confirmed",
    hint: "Notify when a redemption transaction for your wallet confirms.",
    audience: "investor",
  },
  reserveBelowTarget: {
    label: "Reserve below target",
    hint: "Alert when idle USDC drops below reserve policy requirements.",
    audience: "investor",
  },
  basketPaused: {
    label: "Basket paused",
    hint: "Alert when a basket enters a paused operational state.",
    audience: "investor",
  },
  openInterestNearCap: {
    label: "Open interest near cap",
    hint: "Alert when open-interest usage approaches configured guardrails.",
    audience: "operator",
  },
  oracleStale: {
    label: "Oracle stale",
    hint: "Alert when oracle updates have not arrived within expected windows.",
    audience: "operator",
  },
  largeRealizedPnl: {
    label: "Large realized PnL",
    hint: "Alert on outsized realized PnL events from position closures.",
    audience: "operator",
  },
  riskConfigChanged: {
    label: "Risk config changed",
    hint: "Alert when risk-related controls are updated.",
    audience: "operator",
  },
};

export function defaultPushPreferences(): PushPreferences {
  return {
    masterEnabled: true,
    digestEnabled: true,
    events: {
      depositConfirmed: true,
      redeemConfirmed: true,
      reserveBelowTarget: true,
      basketPaused: true,
      openInterestNearCap: true,
      oracleStale: true,
      largeRealizedPnl: true,
      riskConfigChanged: true,
    },
  };
}

export function normalizePushPreferences(input: unknown): PushPreferences {
  const defaults = defaultPushPreferences();
  if (!input || typeof input !== "object") return defaults;

  const row = input as Partial<PushPreferences>;

  return {
    masterEnabled: row.masterEnabled ?? defaults.masterEnabled,
    digestEnabled: row.digestEnabled ?? defaults.digestEnabled,
    events: {
      ...defaults.events,
      ...(row.events ?? {}),
    },
  };
}

export function getPushStorageKey(wallet: string, chainId: number | undefined): string {
  return `indexflow:push-preferences:${wallet.toLowerCase()}:${chainId ?? "na"}`;
}

export function getPushServiceBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_PUSH_SERVICE_URL ?? "").trim().replace(/\/$/, "");
}

export function browserSupportsPush(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export function detectPushPlatform(): string {
  if (typeof window === "undefined") return "unknown";
  const ua = window.navigator.userAgent.toLowerCase();
  if (ua.includes("iphone") || ua.includes("ipad")) return "ios";
  if (ua.includes("android")) return "android";
  if (ua.includes("mac")) return "macos";
  return "web";
}
