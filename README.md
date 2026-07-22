# gmleads-dashboard

Backend for the internal admin dashboard: authentication, leads/session
data, analytics, lead routing, CRM/Slack config UI support, predictive
analytics, and usage reporting. By far the largest route surface of any
backend service.

The Next.js frontend lives in `web/` as an **independent toolchain**
(own `package.json`, deployed separately to Vercel) — see
`web/README.md` for frontend-specific setup. This README covers the
Fastify backend in `src/` only.

## Responsibilities

- **Auth** (KAN-99): per-user dashboard login (Argon2id + JWT + refresh
  tokens), superseding the earlier shared-secret bearer token (ADR-004).
- **Leads/sessions**: list, filter, and read individual sessions;
  respond to (claim/dismiss) an alerted session.
- **Analytics**: funnel (visitor→qualified→booked), alert
  delivery/response-time stats, identification accuracy, widget
  install-verification.
- **Lead routing** (KAN-66/67/68/69): rep management, account
  assignment (CSV upload), routing audit.
- **Predictive analytics** (KAN-74/75/76/77, ADR-016): account scoring,
  dark-funnel accounts, weekly digest — driven by a scheduled cron job
  (`ENABLE_ANALYTICS_SCHEDULER=true`), off by default so no environment
  runs nightly jobs against real data unintentionally.
- **CRM/Slack/business-hours config**: read/write endpoints backing the
  frontend's connect/mapping/channel-picker/business-hours panels
  (`gmleads-crm`/`gmleads-notification` own the actual OAuth flows;
  this service reads their status/config for display).
- **Usage reporting** (M4 task 4.1): sessions used vs.
  `monthly_session_quota` for the current calendar month.

## Endpoints

31 routes under `/internal/*`, grouped:

| Group | Examples |
|---|---|
| Auth | `/internal/auth/login`, `/refresh`, `/logout` |
| Workspaces | `POST /internal/workspaces` |
| Leads/sessions | `/internal/workspaces/:id/leads`, `/sessions/:sid`, `/sessions/:sid/respond` |
| Analytics | `/analytics/funnel`, `/alerts/delivery-stats`, `/alerts/response-stats`, `/analytics/identification-accuracy`, `/widget-status` |
| Usage (M4.1) | `/internal/workspaces/:id/usage` |
| Routing | `/reps`, `/reps/:repId`, `/accounts`, `/accounts/upload`, `/routing/audit` |
| Predictive analytics | `/analytics/account-scores`, `/analytics/dark-funnel`, `/analytics/dark-funnel-settings`, `/analytics/digest-schedule`, `/analytics/digest-log`, `/analytics/rep-performance`, `/analytics/recompute` |
| Config | `/business-hours` |

Called only by `gmleads-gateway`'s proxy. Full shapes in
`gmleads-agents/context/contracts.md`.

## Dependencies

- **Postgres**: by far the widest table surface of any service —
  `workspaces`, `users`, `refresh_tokens`, `leads`/`sessions` (read),
  `reps`, `account_assignments`, `routing_events`,
  `account_scores`, `dark_funnel_accounts`, `digest_deliveries`, and
  more.
- **Redis**: rate limiting only, via `@gmleads/shared`'s
  `createRateLimiter()` (M4 task 4.4) — no event bus usage (this
  service's `server.ts` never calls `getEventBus()`; it's a pure
  API/read service).
- **`node-cron`**: the analytics scheduler, only referenced in
  `server.ts` (never in application logic itself, so tests never have
  to manage background timers — see ADR-016 Decision 2).

## Environment variables

| Var | Purpose |
|---|---|
| `DATABASE_URL` | primary datastore |
| `REDIS_URL` | rate limiting |
| `DASHBOARD_JWT_SECRET` | must byte-match `gmleads-gateway`'s copy |
| `ENABLE_ANALYTICS_SCHEDULER` | `true` to run nightly/hourly cron jobs; off everywhere by default |
| `FEAT_RATE_LIMITING` | `true` in staging/production |
| `ERROR_TRACKING_DSN` | Better Stack error tracking; inactive if unset |

## Local development

```bash
cd ../gmleads-infra && cp .env.example .env.local && docker compose up postgres redis --build
cd ../gmleads-shared && npm ci && npm run build
npm ci
npm run dev   # tsx watch src/server.ts — :3006
```

For the frontend too, see `web/README.md` — it needs this backend (via
`gmleads-gateway`) running.

## Build & test

| Command | What it does |
|---|---|
| `npm run dev` | `tsx watch src/server.ts` |
| `npm run build` | `tsc` |
| `npm test` | `vitest run --coverage` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, zero warnings |

CI has a separate `quality-web` job for `web/`'s own toolchain — see
`web/README.md`.

## Deployment

Backend: Railway (`gmleads-dashboard`), private-only. Manual redeploy
(`railway redeploy --service gmleads-dashboard --yes`); merges to `main`
don't auto-deploy (KAN-112). Frontend (`web/`): Vercel, entirely
separate pipeline — see `web/README.md` and `DEPLOYMENT.md`.

## Health & readiness

- `GET /health` — liveness.
- `GET /health/ready` — dependency-aware (Postgres).

## Operational considerations

- **Graceful shutdown** (M1, M4 task 4.4): stops the analytics
  scheduler (if enabled) before closing the Fastify app, Postgres, and
  the rate limiter's Redis client — the last previously leaked.
- **Rate limiting** (M2, M4.4): defense-in-depth, shared implementation,
  fails open on a Redis outage.
- **statement_timeout** (M4 task 4.5): every query capped at 15s via
  `PostgresAdapter` — verified safe against this service's own query
  patterns, including the nightly analytics scan (loops per-workspace,
  many small queries rather than one cross-tenant scan).
- **Usage endpoint** (M4 task 4.1): the "current period" is always
  server-computed (current UTC calendar month), never caller-supplied —
  scoped to session count only; AI-message/enrichment-lookup usage and
  internal near-quota alerting are explicitly deferred (see
  `decisions.md`'s 2026-07-22 KAN-60 entry and Jira KAN-60).
