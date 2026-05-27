import LogRocket from "logrocket";

export const LOGROCKET_APP_ID = "rvyrh2/indexflow";

const isDev = process.env.NODE_ENV === "development";
const isE2E = process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1";

export function isLogRocketEnabled(): boolean {
  return !isDev && !isE2E;
}

function resolveRelease(): string {
  return (
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
    process.env.NEXT_PUBLIC_APP_VERSION ??
    "0.1.0"
  );
}

let initialized = false;

/** Client-only. Safe to call multiple times. */
export function initLogRocket(): void {
  if (typeof window === "undefined" || initialized || !isLogRocketEnabled()) return;

  LogRocket.init(LOGROCKET_APP_ID, {
    release: resolveRelease(),
    rootHostname: "indexflow.org",
  });

  initialized = true;
}

export function identifyLogRocketUser(
  uid: string,
  traits?: Record<string, string | number | boolean>,
): void {
  if (!isLogRocketEnabled() || !initialized) return;
  LogRocket.identify(uid, traits);
}

export function trackLogRocketEvent(
  name: string,
  properties?: Record<string, string | number | boolean>,
): void {
  if (!isLogRocketEnabled() || !initialized) return;
  LogRocket.track(name, properties);
}

export function captureLogRocketException(
  error: unknown,
  options?: {
    tags?: Record<string, string | number | boolean>;
    extra?: Record<string, string | number | boolean>;
  },
): void {
  if (!isLogRocketEnabled() || !initialized) return;
  const err = error instanceof Error ? error : new Error(String(error));
  LogRocket.captureException(err, options);
}

export { LogRocket };
