"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, BellOff, Download, Smartphone, CheckCircle2 } from "lucide-react";
import { useAccount } from "wagmi";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/ui/toast";
import { PUSH_EVENT_LABELS, type PushEventKey } from "@/lib/push";
import { usePushPreferences } from "@/hooks/usePushPreferences";
import { cn } from "@/lib/utils";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className="flex w-full items-start justify-between gap-4 rounded-md border border-app-border bg-app-bg-subtle px-4 py-3 text-left transition-colors hover:border-app-border-strong disabled:cursor-not-allowed disabled:opacity-60"
    >
      <div>
        <p className="text-sm font-semibold text-app-text">{label}</p>
        <p className="mt-0.5 text-xs text-app-muted">{hint}</p>
      </div>
      <span
        className={cn(
          "mt-1 inline-flex h-5 w-10 items-center rounded-full transition-colors",
          checked ? "bg-app-accent" : "bg-app-border"
        )}
      >
        <span
          className={cn(
            "mx-0.5 h-4 w-4 rounded-full bg-white transition-transform",
            checked ? "translate-x-5" : "translate-x-0"
          )}
        />
      </span>
    </button>
  );
}

export default function SettingsPage() {
  const { isConnected } = useAccount();
  const {
    wallet,
    loading,
    pushSupported,
    preferences,
    permission,
    saveSource,
    isSubscribed,
    setMasterEnabled,
    setDigestEnabled,
    setEventEnabled,
    subscribe,
    unsubscribe,
    sendTest,
  } = usePushPreferences();

  const [working, setWorking] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  const isIOS = useMemo(() => {
    if (typeof window === "undefined") return false;
    const ua = window.navigator.userAgent.toLowerCase();
    return ua.includes("iphone") || ua.includes("ipad");
  }, []);

  const eventEntries = Object.entries(PUSH_EVENT_LABELS) as Array<[
    PushEventKey,
    (typeof PUSH_EVENT_LABELS)[PushEventKey],
  ]>;

  const investorEvents = eventEntries.filter(([, v]) => v.audience === "investor");
  const operatorEvents = eventEntries.filter(([, v]) => v.audience === "operator");

  const saveBadge =
    saveSource === "cloud"
      ? "Saved to cloud"
      : saveSource === "local"
        ? "Saved locally (sync pending)"
        : "Not saved yet";

  const runAction = async (label: string, fn: () => Promise<unknown>) => {
    setWorking(true);
    try {
      await fn();
      showToast("success", label);
    } catch {
      showToast("error", `${label} failed`);
    } finally {
      setWorking(false);
    }
  };

  if (!isConnected || !wallet) {
    return (
      <PageWrapper className="max-w-3xl">
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-lg font-semibold text-app-text">Connect your wallet</p>
            <p className="mt-2 text-sm text-app-muted">Notification preferences are saved per wallet address.</p>
          </CardContent>
        </Card>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-app-text">Settings</h1>
        <p className="mt-2 text-sm text-app-muted">Manage push notifications and install behavior for this device.</p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-app-text">
              <Smartphone className="h-4 w-4" />
              Install App
            </h2>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-app-muted">
            {installPrompt ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  await installPrompt.prompt();
                  setInstallPrompt(null);
                }}
              >
                <Download className="mr-2 h-4 w-4" /> Install on this device
              </Button>
            ) : (
              <p>Install prompt not currently available in this browser session.</p>
            )}
            {isIOS && (
              <p>
                On iOS Safari, use <strong>Share → Add to Home Screen</strong> to install the app.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-app-text">
                {preferences.masterEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                Push Notifications
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-app-border px-2 py-1 text-xs text-app-muted">
                <CheckCircle2 className="h-3 w-3" /> {saveBadge}
              </span>
            </div>
            <p className="mt-2 text-sm text-app-muted">
              Permission: <strong>{permission}</strong> · Subscription: <strong>{isSubscribed ? "active" : "inactive"}</strong>
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {!pushSupported && (
              <p className="text-sm text-app-danger">
                This browser does not support Push API. Install the app on a supported browser to receive background notifications.
              </p>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={working || !pushSupported}
                onClick={() => runAction("Push subscription enabled", async () => { await subscribe(); })}
              >
                Enable Push
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={working || !pushSupported}
                onClick={() => runAction("Push subscription disabled", async () => { await unsubscribe(); })}
              >
                Disable Push
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={working || !pushSupported || !isSubscribed}
                onClick={() => runAction("Test notification sent", async () => {
                  const ok = await sendTest();
                  if (!ok) throw new Error("test-failed");
                })}
              >
                Send Test Notification
              </Button>
            </div>

            <ToggleRow
              label="Enable all push notifications"
              hint="Master switch for all real-time categories"
              checked={preferences.masterEnabled}
              disabled={working || loading}
              onToggle={() => void setMasterEnabled(!preferences.masterEnabled)}
            />

            <ToggleRow
              label="Enable digest notifications"
              hint="Receive periodic summaries for non-critical activity"
              checked={preferences.digestEnabled}
              disabled={working || loading || !preferences.masterEnabled}
              onToggle={() => void setDigestEnabled(!preferences.digestEnabled)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-app-text">Investor Alerts</h2>
          </CardHeader>
          <CardContent className="space-y-2">
            {investorEvents.map(([key, val]) => (
              <ToggleRow
                key={key}
                label={val.label}
                hint={val.hint}
                checked={preferences.events[key]}
                disabled={working || loading || !preferences.masterEnabled}
                onToggle={() => void setEventEnabled(key, !preferences.events[key])}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-app-text">Operator Alerts</h2>
          </CardHeader>
          <CardContent className="space-y-2">
            {operatorEvents.map(([key, val]) => (
              <ToggleRow
                key={key}
                label={val.label}
                hint={val.hint}
                checked={preferences.events[key]}
                disabled={working || loading || !preferences.masterEnabled}
                onToggle={() => void setEventEnabled(key, !preferences.events[key])}
              />
            ))}
          </CardContent>
        </Card>
      </div>
    </PageWrapper>
  );
}
