import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs";

/** Plain http:// origins blocked by connect-src https: — needed for local Graph Node + Anvil in next dev. */
const localDevConnectOrigins =
  process.env.NODE_ENV === "development"
    ? [
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://127.0.0.1:8545",
        "http://localhost:8545",
        "http://127.0.0.1:8546",
        "http://localhost:8546",
      ].join(" ")
    : "";

const logRocketScriptSrc = [
  "https://cdn.logrocket.io",
  "https://cdn.lr-ingest.io",
  "https://cdn.lr-in.com",
  "https://cdn.lr-in-prod.com",
  "https://cdn.lr-ingest.com",
  "https://cdn.ingest-lr.com",
  "https://cdn.lr-intake.com",
  "https://cdn.intake-lr.com",
  "https://cdn.logr-ingest.com",
  "https://cdn.lrkt-in.com",
  "https://cdn.lgrckt-in.com",
  "https://cdn.logr-in.com",
].join(" ");

const logRocketConnectSrc = [
  "https://*.logrocket.io",
  "https://*.lr-ingest.io",
  "https://*.logrocket.com",
  "https://*.lr-in.com",
  "https://*.lr-in-prod.com",
  "https://*.lr-ingest.com",
  "https://*.ingest-lr.com",
  "https://*.lr-intake.com",
  "https://*.intake-lr.com",
  "https://*.logr-ingest.com",
  "https://*.lrkt-in.com",
  "https://*.lgrckt-in.com",
  "https://*.logr-in.com",
].join(" ");

const connectSrc = [
  "'self'",
  "https:",
  "wss:",
  "https://*.sentry.io",
  logRocketConnectSrc,
  localDevConnectOrigins,
]
  .filter(Boolean)
  .join(" ");

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://auth.privy.io https://va.vercel-scripts.com ${logRocketScriptSrc}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      `connect-src ${connectSrc}`,
      "frame-src 'self' https://auth.privy.io",
      "object-src 'none'",
      "base-uri 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "framer-motion",
      "@privy-io/react-auth",
      "wagmi",
      "viem",
      "@tanstack/react-query",
      "react-markdown",
    ],
  },
  staticPageGenerationTimeout: 120,
  serverExternalPackages: ["yahoo-finance2"],
};

const analyze = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

export default withSentryConfig(analyze(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  tunnelRoute: "/sentry-tunnel",
});
