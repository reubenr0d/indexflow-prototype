This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Local Development

The recommended way to develop locally is via the Docker Compose workflow from the **repo root**:

```bash
# From repo root — start Docker Anvil + deploy contracts
npm run local:up

# Start the Envio HyperIndex indexer (separate terminal)
npm run --prefix apps/envio dev:local

# Start the UI dev server with the indexer URL (hot reloads on file changes)
NEXT_PUBLIC_ENVIO_URL=http://127.0.0.1:8080/v1/graphql npm run local:dev

# After Solidity changes, redeploy contracts (restart the indexer after redeploys):
npm run redeploy:local
```

The dev server picks up contract address changes in `src/config/local-deployment.json` via HMR.

See the root `README.md` **Local Development** section for full details.

## Standalone Dev Server

To run the dev server without Docker (RPC-only reads; indexer-backed views fall back to RPC):

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result. The page auto-updates as you edit files.

## Indexer Configuration

The web app reads from a single Envio HyperIndex GraphQL (Hasura) endpoint serving every chain. Configure via `NEXT_PUBLIC_ENVIO_URL` (in `apps/web/.env.local`, the Vercel project env, or the shell when starting `npm run dev`):

```bash
NEXT_PUBLIC_ENVIO_URL=http://127.0.0.1:8080/v1/graphql
# or
NEXT_PUBLIC_ENVIO_URL=https://indexer.envio.dev/<deployment-id>/v1/graphql
```

Read policy:

- `NEXT_PUBLIC_ENVIO_URL` set and indexer healthy: indexed list/history/portfolio views use the indexer first.
- `NEXT_PUBLIC_ENVIO_URL` unset or indexer query failure/empty result: affected views fall back entirely to RPC reads.
- Live-critical values (wallet balances and risk state) continue to read from RPC.
- "All Chains" view aggregates across every chain the indexer covers (served from the same endpoint).

## Transaction UX

The app runs Privy embedded-wallet transactions **headlessly** — no Privy confirmation popup. The signing happens silently and progress shows up in two places:

- **Inline stepper** inside the deposit/redeem card, which morphs through `Signing → Submitted → Confirmed` (and a `Try again` row on failure), with an explorer link on submitted/confirmed.
- **Floating transaction dock** at the bottom-right of every page (`apps/web/src/components/transactions/transaction-dock.tsx`), driven by `TransactionStatusProvider`. Up to three mini cards stack in collapsed mode; click any to expand into a scrollable list. Confirmed rows auto-clear after a few seconds; failed rows persist until dismissed.

The headless behaviour is controlled by `embeddedWallets.showWalletUIs: false` in [`src/config/privy.ts`](src/config/privy.ts). External (e.g. MetaMask) wallets still see their own wallet popup — those flows are gated separately in `useSponsoredWriteContract`. See the Privy [whitelabel](https://docs.privy.io/wallets/using-wallets/whitelabel) and [manage-wallet-UIs](https://docs.privy.io/recipes/react/manage-wallet-UIs) docs for the API.

## Push Notifications

Set the push service URL to enable cloud-synced notification preferences and device subscriptions on `/settings`:

```bash
NEXT_PUBLIC_PUSH_SERVICE_URL=https://<your-cloud-run-service-url>
```

If unset or unavailable, the settings page falls back to wallet-scoped local storage.

## App Updates and Loading UX

- Production builds use a fresh-first service-worker strategy to avoid stale HTML/chunk mismatches after deploys.
- When a new version is available, the app shows a persistent top banner with a one-click reload action.
- If a boot-time chunk mismatch happens, a recovery UI is shown with retry/refresh controls (instead of a blank screen).
- Core user routes use route-level structured loading states for smoother transitions.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
