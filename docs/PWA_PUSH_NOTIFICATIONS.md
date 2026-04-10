# PWA + Push Notifications

This document explains the installable PWA flow and the background push architecture.

## What ships in the web app

- `app/manifest.ts` defines the web manifest (`/manifest.webmanifest`): app name, standalone display mode, theme/background colors, and icon metadata.
- `public/sw.js` handles:
  - shell caching for core routes,
  - push payload rendering via `showNotification`,
  - notification deep-link navigation on click.
- `PwaBootstrap` registers the service worker at app boot.
- `/settings` exposes user notification controls and install guidance:
  - master push toggle,
  - digest toggle,
  - per-event toggles,
  - subscribe/unsubscribe,
  - test notification send.

## Reliable background push requirement

Background push while the app is closed requires a server-side sender.
A frontend-only app cannot reliably deliver closed-app notifications.

## Push backend architecture

Runtime: **Google Cloud Run**

Data: **Firestore**

Scheduler: **Cloud Scheduler**

Trigger source: **Subgraph-first**

### Service endpoints

- `GET /healthz`
- `GET /v1/push/public-key`
- `POST /v1/push/subscribe`
- `POST /v1/push/unsubscribe`
- `GET /v1/push/preferences?wallet=...`
- `POST /v1/push/preferences`
- `POST /v1/push/test`
- `POST /v1/push/dispatch` (auth required)

### Firestore collections

- `subscriptions/{wallet_endpointHash}`
- `preferences/{wallet}`
- `dispatch_state/global`
- `dispatch_log/{eventKeyHash}`

## Notification categories (v1)

Investor:

- `depositConfirmed`
- `redeemConfirmed`
- `reserveBelowTarget`
- `basketPaused`

Operator:

- `openInterestNearCap`
- `oracleStale`
- `largeRealizedPnl`
- `riskConfigChanged`

Digest:

- `digestEnabled` controls periodic summary notifications.

## Environment variables

### Web app (`apps/web`)

- `NEXT_PUBLIC_PUSH_SERVICE_URL` (Cloud Run service base URL)

### Push worker (`apps/push-worker`)

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_CONTACT_EMAIL`
- `SUBGRAPH_URL`
- `DISPATCH_AUTH_TOKEN`
- `OPEN_INTEREST_NEAR_CAP_BPS` (optional)
- `ORACLE_STALE_THRESHOLD_SECONDS` (optional)
- `LARGE_PNL_THRESHOLD_USD` (optional)
- `RESERVE_BREACH_COOLDOWN_MS` (optional)

## Staging runbook

1. Install app on iOS Home Screen and Android.
2. Connect wallet and configure `/settings` toggles.
3. Enable push subscription.
4. Trigger representative investor/operator events.
5. Close app and verify background push is delivered.
6. Open notification and verify deep-link routing.

