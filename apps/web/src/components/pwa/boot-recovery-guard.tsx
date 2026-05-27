"use client";

import { useEffect, useMemo, useState } from "react";

function isRecoverableBootError(reason: unknown): boolean {
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === "string"
        ? reason
        : reason && typeof reason === "object" && "message" in reason
          ? String((reason as { message?: unknown }).message)
          : "";

  const lowered = message.toLowerCase();
  return (
    lowered.includes("loading chunk") ||
    lowered.includes("chunkloaderror") ||
    lowered.includes("dynamically imported module") ||
    lowered.includes("failed to fetch dynamically imported module")
  );
}

export function BootRecoveryGuard() {
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (!isRecoverableBootError(event.error ?? event.message)) return;
      setErrorText("A new version was deployed while this page was open.");
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      if (!isRecoverableBootError(event.reason)) return;
      setErrorText("The app failed to load updated code.");
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  const helpText = useMemo(() => errorText ?? "", [errorText]);

  if (!errorText) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-app-bg/95 px-4">
      <div className="w-full max-w-lg rounded-xl border border-app-border bg-app-surface p-6 shadow-[var(--shadow)]">
        <p className="text-xs font-medium uppercase tracking-wide text-app-muted">Recovery mode</p>
        <h2 className="mt-2 text-xl font-semibold text-app-text">We hit a load mismatch</h2>
        <p className="mt-2 text-sm text-app-muted">{helpText} Refresh to load the latest app bundle.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-app-accent px-4 py-2 text-sm font-semibold text-app-accent-fg hover:opacity-90"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border border-app-border px-4 py-2 text-sm font-semibold text-app-text hover:bg-app-bg-subtle"
          >
            Hard refresh
          </button>
        </div>
      </div>
    </div>
  );
}
