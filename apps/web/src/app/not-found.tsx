import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-6xl font-bold text-app-accent">404</p>
      <h1 className="mt-4 text-2xl font-semibold text-app-text">Page not found</h1>
      <p className="mt-2 max-w-md text-app-muted">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/"
          className="rounded-md bg-app-accent px-5 py-2.5 text-sm font-semibold text-app-accent-fg transition-opacity hover:opacity-90"
        >
          Go home
        </Link>
        <Link
          href="/baskets"
          className="rounded-md border border-app-border px-5 py-2.5 text-sm font-semibold text-app-text transition-colors hover:bg-app-surface"
        >
          Browse baskets
        </Link>
      </div>
    </main>
  );
}
