"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-6xl font-bold text-app-danger">500</p>
      <h1 className="mt-4 text-2xl font-semibold text-app-text">Something went wrong</h1>
      <p className="mt-2 max-w-md text-app-muted">
        An unexpected error occurred. You can try again or return to the homepage.
      </p>
      <div className="mt-8 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-app-accent px-5 py-2.5 text-sm font-semibold text-app-accent-fg transition-opacity hover:opacity-90"
        >
          Try again
        </button>
        <a
          href="/"
          className="rounded-md border border-app-border px-5 py-2.5 text-sm font-semibold text-app-text transition-colors hover:bg-app-surface"
        >
          Go home
        </a>
      </div>
    </main>
  );
}
