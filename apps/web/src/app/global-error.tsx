"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { captureLogRocketException } from "@/lib/logrocket";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    captureLogRocketException(error, {
      tags: { surface: "global-error" },
      extra: { digest: error.digest ?? "" },
    });
  }, [error]);

  return (
    <html>
      <body>
        <main className="flex min-h-screen items-center justify-center bg-app-bg px-4">
          <div className="w-full max-w-lg rounded-xl border border-app-border bg-app-surface p-6 text-center shadow-[var(--shadow)]">
            <p className="text-xs font-medium uppercase tracking-wide text-app-muted">App recovery</p>
            <h1 className="mt-2 text-2xl font-semibold text-app-text">Something interrupted app startup</h1>
            <p className="mt-2 text-sm text-app-muted">
              Try reloading to fetch the latest client bundle.
            </p>
            <div className="mt-5 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => unstable_retry()}
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
        </main>
      </body>
    </html>
  );
}
