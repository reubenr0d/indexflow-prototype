This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Local Development

The recommended way to develop locally is via the Docker Compose workflow from the **repo root**:

```bash
# From repo root — start Docker infra + deploy contracts + subgraph
npm run local:up

# Start the UI dev server (hot reloads on file changes)
npm run local:dev

# After changing Solidity or subgraph code, redeploy:
npm run redeploy:local
```

`local:dev` sets `NEXT_PUBLIC_SUBGRAPH_URL` to the local graph-node automatically. The dev server picks up contract address changes in `src/config/local-deployment.json` via HMR.

See the root `README.md` **Local Development** section for full details.

## Standalone Dev Server

To run the dev server without the Docker stack (RPC-only, no subgraph):

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result. The page auto-updates as you edit files.

## Subgraph Configuration

Set the subgraph endpoint to enable hybrid GraphQL + RPC reads:

```bash
NEXT_PUBLIC_SUBGRAPH_URL=http://localhost:8000/subgraphs/name/indexflow-prototype
```

This is set automatically by `npm run local:dev`.

Read policy:

- Subgraph URL set and healthy: indexed/list/history views use subgraph-first.
- URL unset or subgraph query failure/empty result: affected views fall back entirely to RPC reads.
- Live-critical values (wallet balances and risk state) continue to read from RPC.

## Push Notifications

Set the push service URL to enable cloud-synced notification preferences and device subscriptions on `/settings`:

```bash
NEXT_PUBLIC_PUSH_SERVICE_URL=https://<your-cloud-run-service-url>
```

If unset or unavailable, the settings page falls back to wallet-scoped local storage.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
