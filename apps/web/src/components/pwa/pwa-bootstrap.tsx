"use client";

import { useEffect, useState } from "react";

function UpdateBanner({
  onReload,
  onDismiss,
}: {
  onReload: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-x-0 top-0 z-[70] border-b border-app-accent/30 bg-app-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 text-sm sm:px-6">
        <p className="text-app-text">New version available. Reload to update safely.</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md border border-app-border px-3 py-1 text-xs font-medium text-app-muted hover:text-app-text"
          >
            Later
          </button>
          <button
            type="button"
            onClick={onReload}
            className="rounded-md bg-app-accent px-3 py-1 text-xs font-semibold text-app-accent-fg hover:opacity-90"
          >
            Reload now
          </button>
        </div>
      </div>
    </div>
  );
}

export function PwaBootstrap() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV === "development") {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => undefined);
      return;
    }

    const onControllerChange = () => {
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        const setWaiting = () => {
          if (!registration.waiting) return;
          setWaitingWorker(registration.waiting);
          setShowUpdate(true);
        };

        setWaiting();

        registration.addEventListener("updatefound", () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;
          installingWorker.addEventListener("statechange", () => {
            if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
              setWaiting();
            }
          });
        });
      })
      .catch(() => undefined);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  const onReload = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
      return;
    }
    window.location.reload();
  };

  if (!showUpdate) return null;

  return <UpdateBanner onReload={onReload} onDismiss={() => setShowUpdate(false)} />;
}
