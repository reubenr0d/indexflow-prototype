# Push Worker (Cloud Run)

Serverless push-delivery service for IndexFlow.

## Endpoints

- `GET /healthz`
- `GET /v1/push/public-key`
- `POST /v1/push/subscribe`
- `POST /v1/push/unsubscribe`
- `GET /v1/push/preferences?wallet=...`
- `POST /v1/push/preferences`
- `POST /v1/push/test`
- `POST /v1/push/dispatch` (requires `Authorization: Bearer <DISPATCH_AUTH_TOKEN>`)

## Run locally

```bash
npm ci --prefix apps/push-worker
npm run --prefix apps/push-worker dev
```

## Required environment

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_CONTACT_EMAIL`
- `SUBGRAPH_URL`
- `DISPATCH_AUTH_TOKEN`

## Deploy

Deploy automation lives in `.github/workflows/deploy-production.yml` and targets Cloud Run + Cloud Scheduler.
