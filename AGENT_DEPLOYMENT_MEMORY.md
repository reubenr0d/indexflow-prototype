# Agent Deployment Memory

Local allowlist/ownership ledger for deployment operations.
Agents must read this file before touching cloud resources.

Last updated: 2026-04-11

## Policy

- Resources not listed here are treated as protected (`read` only).
- Existing deployments are user-owned unless explicitly marked otherwise.
- Agent-created resources must be recorded immediately after creation.

## Resources

| Provider | Project/Account | Resource Type | Resource Name | Environment | Owner | Allowed Actions | Purpose | Created |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GCP | `industrial-joy-440019-h3` | Cloud Run Service | `PUSH_WORKER_SERVICE` (from env/secrets) | production | user | `read`, `deploy`, `update-config` | Web Push API/dispatch worker for PWA notifications | 2026-04-10 |
| GCP | `industrial-joy-440019-h3` | Cloud Scheduler Job | `PUSH_REALTIME_JOB_NAME` (from env/secrets) | production | user | `read`, `deploy`, `update-config` | Triggers realtime push dispatch cadence | 2026-04-10 |
| GCP | `industrial-joy-440019-h3` | Cloud Scheduler Job | `PUSH_DIGEST_JOB_NAME` (from env/secrets) | production | user | `read`, `deploy`, `update-config` | Triggers digest push dispatch cadence | 2026-04-10 |
| Vercel | org/project from CI secrets | Web Deployment | `apps/web` production deployment | production | user | `read`, `deploy` | Production Next.js web app deployment | 2026-04-10 |
| GCP | `watchful-gear-493003-t8` | Cloud Run Service | `indexflow-push-worker` | production | agent | `read`, `deploy`, `update-config` | Serverless Web Push API/dispatch worker for PWA notifications | 2026-04-11 |
| GCP | `watchful-gear-493003-t8` | Cloud Scheduler Job | `indexflow-push-realtime` | production | agent | `read`, `deploy`, `update-config` | Realtime dispatch trigger (`*/5 * * * *`) | 2026-04-11 |
| GCP | `watchful-gear-493003-t8` | Cloud Scheduler Job | `indexflow-push-digest` | production | agent | `read`, `deploy`, `update-config` | Digest dispatch trigger (`0 */6 * * *`) | 2026-04-11 |

## Update Template

Use this template for new entries:

| Provider | Project/Account | Resource Type | Resource Name | Environment | Owner | Allowed Actions | Purpose | Created |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `<provider>` | `<project>` | `<type>` | `<name>` | `<env>` | `agent|user` | `<comma-separated-actions>` | `<short-purpose>` | `<YYYY-MM-DD>` |
