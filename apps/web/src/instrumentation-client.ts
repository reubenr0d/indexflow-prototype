import * as Sentry from "@sentry/nextjs";
import { initLogRocket } from "@/lib/logrocket";

const isDev = process.env.NODE_ENV === "development";

initLogRocket();

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  sendDefaultPii: true,
  tracesSampleRate: isDev ? 0 : 0.1,
  replaysSessionSampleRate: isDev ? 0 : 0.1,
  replaysOnErrorSampleRate: isDev ? 0 : 1.0,
  integrations: isDev ? [] : [Sentry.replayIntegration()],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
