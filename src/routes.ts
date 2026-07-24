import type { FastifyInstance } from 'fastify';
import { parse as parseCsv } from 'csv-parse/sync';
import {
  getDb,
  createWorkspaceRequestSchema,
  loginRequestSchema,
  refreshRequestSchema,
  logoutRequestSchema,
  respondToAlertRequestSchema,
  snoozeSessionRequestSchema,
  createRepRequestSchema,
  updateRepRequestSchema,
  accountCsvRowSchema,
  updateDarkFunnelSettingsRequestSchema,
  updateDigestScheduleRequestSchema,
  updateBusinessHoursRequestSchema,
  classifyMatchKey,
  hashPassword,
  verifyPassword,
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  REFRESH_TOKEN_TTL_SECONDS,
  type SessionStatus,
} from '@gmleads/shared';
import { WorkspaceRepo } from './db/workspace.repo.js';
import { LeadsRepo, type IdentificationSourceFilter } from './db/leads.repo.js';
import { UsersRepo } from './db/users.repo.js';
import { RefreshTokensRepo } from './db/refresh-tokens.repo.js';
import { AlertResponsesRepo } from './db/alert-responses.repo.js';
import { AnalyticsRepo } from './db/analytics.repo.js';
import { UsageRepo } from './db/usage.repo.js';
import { RepsRepo } from './db/reps.repo.js';
import { AccountAssignmentsRepo } from './db/account-assignments.repo.js';
import { RoutingEventsRepo } from './db/routing-events.repo.js';
import { buildAnalyticsServices } from './analytics/build-analytics-services.js';

// Query params are always optional ISO strings — undefined means "no bound".
// Returns undefined for a missing value, null to signal "provided but
// unparseable" so the caller can 400 instead of silently ignoring it.
function parseOptionalDate(value: string | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// A fixed Argon2id hash with no real corresponding password. Verifying
// against this on an email miss means a login attempt against a
// non-existent email takes the same time as one against a real email with
// a wrong password — otherwise the response-time difference is a
// user-enumeration side channel (OWASP A07). Computed once, not per
// request (hashPassword is deliberately slow).
const dummyHashPromise = hashPassword('not-a-real-password-just-for-timing-safety');

function jwtSecretOrNull(): string | null {
  return process.env.DASHBOARD_JWT_SECRET ?? null;
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();
  const workspaceRepo = new WorkspaceRepo(db);
  const leadsRepo = new LeadsRepo(db);
  const usersRepo = new UsersRepo(db);
  const refreshTokensRepo = new RefreshTokensRepo(db);
  const alertResponsesRepo = new AlertResponsesRepo(db);
  const analyticsRepo = new AnalyticsRepo(db);
  const usageRepo = new UsageRepo(db);
  const repsRepo = new RepsRepo(db);
  const accountAssignmentsRepo = new AccountAssignmentsRepo(db);
  const routingEventsRepo = new RoutingEventsRepo(db);

  // KAN-74/75/76/77 — Predictive Analytics (Wave 3). See ADR-016.
  const {
    accountScoresRepo,
    darkFunnelRepo,
    digestDeliveriesRepo,
    accountScoringService,
    darkFunnelService,
  } = buildAnalyticsServices(db, app.log);

  app.post('/internal/workspaces', async (req, reply) => {
    const parsed = createWorkspaceRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }
    const { name, slackWebhookUrl, slackChannelUrl, icpDefinition, adminEmail, adminPassword } =
      parsed.data;

    // KAN-99: every workspace gets its first user created in the same
    // transaction as the workspace row (see ADR-013) — a workspace can
    // never exist with zero logins able to reach its dashboard.
    const passwordHash = await hashPassword(adminPassword);
    const workspace = await db.transaction(async (tx) => {
      const ws = await new WorkspaceRepo(tx).create({
        name,
        slackWebhookUrl: slackWebhookUrl ?? null,
        slackChannelUrl: slackChannelUrl ?? null,
        icpDefinition: icpDefinition ?? {},
      });
      await new UsersRepo(tx).create(ws.id, adminEmail, passwordHash);
      return ws;
    });
    return reply.code(201).send(workspace);
  });

  app.get<{
    Params: { id: string };
    Querystring: {
      status?: string;
      minScore?: string;
      identificationSource?: string;
      hideSnoozed?: string;
      limit?: string;
      offset?: string;
    };
  }>('/internal/workspaces/:id/leads', async (req, reply) => {
    const workspace = await workspaceRepo.findById(req.params.id);
    if (!workspace) return reply.code(404).send({ error: 'not_found' });

    const { status, minScore, identificationSource, hideSnoozed, limit, offset } = req.query;
    const leads = await leadsRepo.listLeads(req.params.id, {
      status: status as SessionStatus | undefined,
      minScore: minScore ? Number(minScore) : undefined,
      identificationSource: identificationSource as IdentificationSourceFilter | undefined,
      hideSnoozed: hideSnoozed === 'true',
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    return reply.send({ leads });
  });

  app.get<{ Params: { id: string; sid: string } }>(
    '/internal/workspaces/:id/sessions/:sid',
    async (req, reply) => {
      const workspace = await workspaceRepo.findById(req.params.id);
      if (!workspace) return reply.code(404).send({ error: 'not_found' });

      const result = await leadsRepo.getSessionWithTurns(req.params.id, req.params.sid);
      if (!result) return reply.code(404).send({ error: 'not_found' });
      return reply.send(result);
    }
  );

  // KAN-59 — rep response to an alerted session. 'booked' is recorded
  // automatically elsewhere (gmleads-session's slot.booked handler) and is
  // deliberately not postable here (respondToAlertRequestSchema rejects
  // it). Idempotent: if this session already has a response (from either
  // path), returns whichever action actually persisted, not necessarily
  // the one this call requested — first response wins, enforced by
  // alert_responses' own UNIQUE(session_id) constraint.
  app.post<{ Params: { id: string; sid: string } }>(
    '/internal/workspaces/:id/sessions/:sid/respond',
    async (req, reply) => {
      const parsed = respondToAlertRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
      }

      const result = await leadsRepo.getSessionWithTurns(req.params.id, req.params.sid);
      if (!result) return reply.code(404).send({ error: 'not_found' });

      const response = await alertResponsesRepo.respond(
        req.params.sid,
        req.params.id,
        parsed.data.action
      );
      return reply.code(200).send(response);
    }
  );

  // KAN-52 — snooze an alert for a fixed number of minutes. Deliberately
  // separate from /respond: a snooze is not a terminal response (see
  // migration 015's comment) and must not touch alert_responses.
  app.patch<{ Params: { id: string; sid: string } }>(
    '/internal/workspaces/:id/sessions/:sid/snooze',
    async (req, reply) => {
      const parsed = snoozeSessionRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
      }

      const snoozedUntil = await leadsRepo.snooze(req.params.id, req.params.sid, parsed.data.minutes);
      if (!snoozedUntil) return reply.code(404).send({ error: 'not_found' });
      return reply.code(200).send({ snoozedUntil });
    }
  );

  // KAN-59 — avg/median response time + responded/no-response counts for
  // the workspace, over an optional date range (applied to the alert's
  // delivery instant). Literal AC wording is avg/median, not p95 (that's
  // KAN-51's separate delivery-latency metric).
  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>(
    '/internal/workspaces/:id/alerts/response-stats',
    async (req, reply) => {
      const workspace = await workspaceRepo.findById(req.params.id);
      if (!workspace) return reply.code(404).send({ error: 'not_found' });

      const from = parseOptionalDate(req.query.from);
      const to = parseOptionalDate(req.query.to);
      if (from === null || to === null) {
        return reply.code(400).send({ error: 'invalid_request', details: 'from/to must be valid ISO dates' });
      }

      const stats = await alertResponsesRepo.getResponseStats(req.params.id, from, to);
      return reply.send(stats);
    }
  );

  // KAN-58 — funnel stage counts (visitor/qualified/booked) over an
  // optional date range applied to session creation. Read-only, same
  // date-range/404 pattern as KAN-59's response-stats route above.
  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>(
    '/internal/workspaces/:id/analytics/funnel',
    async (req, reply) => {
      const workspace = await workspaceRepo.findById(req.params.id);
      if (!workspace) return reply.code(404).send({ error: 'not_found' });

      const from = parseOptionalDate(req.query.from);
      const to = parseOptionalDate(req.query.to);
      if (from === null || to === null) {
        return reply.code(400).send({ error: 'invalid_request', details: 'from/to must be valid ISO dates' });
      }

      const stats = await analyticsRepo.getFunnelStats(req.params.id, from, to);
      return reply.send(stats);
    }
  );

  // KAN-58 — alert delivery health (p50/p95 latency, success/failure
  // counts) over alert_deliveries (KAN-51/102), same date-range convention.
  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>(
    '/internal/workspaces/:id/alerts/delivery-stats',
    async (req, reply) => {
      const workspace = await workspaceRepo.findById(req.params.id);
      if (!workspace) return reply.code(404).send({ error: 'not_found' });

      const from = parseOptionalDate(req.query.from);
      const to = parseOptionalDate(req.query.to);
      if (from === null || to === null) {
        return reply.code(400).send({ error: 'invalid_request', details: 'from/to must be valid ISO dates' });
      }

      const stats = await analyticsRepo.getDeliveryStats(req.params.id, from, to);
      return reply.send(stats);
    }
  );

  // KAN-101 — widget install-verification. Read-only, no date range (the
  // AC only needs the single most-recent-session instant, not a range).
  app.get<{ Params: { id: string } }>(
    '/internal/workspaces/:id/widget-status',
    async (req, reply) => {
      const workspace = await workspaceRepo.findById(req.params.id);
      if (!workspace) return reply.code(404).send({ error: 'not_found' });

      const status = await analyticsRepo.getWidgetStatus(req.params.id);
      return reply.send(status);
    }
  );

  // KAN-60 — sessions used vs monthly_session_quota for the current
  // calendar month. No date-range params (unlike the analytics routes
  // above) — the "current period" is always server-computed, see
  // usage.repo.ts.
  app.get<{ Params: { id: string } }>(
    '/internal/workspaces/:id/usage',
    async (req, reply) => {
      const workspace = await workspaceRepo.findById(req.params.id);
      if (!workspace) return reply.code(404).send({ error: 'not_found' });

      const usage = await usageRepo.getCurrentPeriodUsage(workspace.id, {
        sessionsQuota: workspace.monthlySessionQuota ?? 1000,
        enrichmentLookupsQuota: workspace.monthlyEnrichmentQuota ?? 1000,
      });
      return reply.send(usage);
    }
  );

  // KAN-40 — identification accuracy reporting (resolved/unknown/failed/
  // low-confidence counts). Reuses sessions.firmographics only.
  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>(
    '/internal/workspaces/:id/analytics/identification-accuracy',
    async (req, reply) => {
      const workspace = await workspaceRepo.findById(req.params.id);
      if (!workspace) return reply.code(404).send({ error: 'not_found' });

      const from = parseOptionalDate(req.query.from);
      const to = parseOptionalDate(req.query.to);
      if (from === null || to === null) {
        return reply.code(400).send({ error: 'invalid_request', details: 'from/to must be valid ISO dates' });
      }

      const stats = await analyticsRepo.getIdentificationAccuracyStats(req.params.id, from, to);
      return reply.send(stats);
    }
  );

  // KAN-66 — rep management (add/update; no hard delete, see reps.repo.ts).
  app.post<{ Params: { id: string } }>('/internal/workspaces/:id/reps', async (req, reply) => {
    const workspace = await workspaceRepo.findById(req.params.id);
    if (!workspace) return reply.code(404).send({ error: 'not_found' });

    const parsed = createRepRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }
    const rep = await repsRepo.create(req.params.id, {
      name: parsed.data.name,
      email: parsed.data.email,
      slackMemberId: parsed.data.slackMemberId ?? null,
    });
    return reply.code(201).send(rep);
  });

  app.get<{ Params: { id: string } }>('/internal/workspaces/:id/reps', async (req, reply) => {
    const workspace = await workspaceRepo.findById(req.params.id);
    if (!workspace) return reply.code(404).send({ error: 'not_found' });
    return reply.send(await repsRepo.list(req.params.id));
  });

  app.patch<{ Params: { id: string; repId: string } }>(
    '/internal/workspaces/:id/reps/:repId',
    async (req, reply) => {
      const workspace = await workspaceRepo.findById(req.params.id);
      if (!workspace) return reply.code(404).send({ error: 'not_found' });

      const parsed = updateRepRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
      }
      const rep = await repsRepo.update(req.params.id, req.params.repId, parsed.data);
      if (!rep) return reply.code(404).send({ error: 'not_found' });
      return reply.send(rep);
    }
  );

  // KAN-66 — CSV account-list upload. Expects columns literally named
  // `account` (a domain or company name — classified by classifyMatchKey)
  // and `repEmail` (must match an existing rep's email exactly). Every row
  // is validated and reported independently — one bad row never rejects
  // the whole file — and re-uploading upserts existing mappings rather
  // than duplicating them (UNIQUE(workspace_id, match_key) in the schema).
  app.post<{ Params: { id: string } }>(
    '/internal/workspaces/:id/accounts/upload',
    async (req, reply) => {
      const workspace = await workspaceRepo.findById(req.params.id);
      if (!workspace) return reply.code(404).send({ error: 'not_found' });

      const file = await req.file();
      if (!file) {
        return reply.code(400).send({ error: 'invalid_request', details: 'no file uploaded' });
      }
      const buffer = await file.toBuffer();

      let records: unknown[];
      try {
        records = parseCsv(buffer, { columns: true, skip_empty_lines: true, trim: true });
      } catch (err) {
        return reply.code(400).send({
          error: 'invalid_request',
          details: `CSV could not be parsed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }

      const results: Array<{
        row: number;
        status: 'ok' | 'error';
        account?: string;
        error?: string;
      }> = [];

      for (let i = 0; i < records.length; i++) {
        const rowNumber = i + 2; // header row is line 1; rows are 1-indexed
        const parsedRow = accountCsvRowSchema.safeParse(records[i]);
        if (!parsedRow.success) {
          results.push({
            row: rowNumber,
            status: 'error',
            error: 'malformed row — expected non-empty "account" and a valid "repEmail" column',
          });
          continue;
        }
        const { account, repEmail } = parsedRow.data;

        const rep = await repsRepo.findByEmail(req.params.id, repEmail);
        if (!rep) {
          results.push({ row: rowNumber, status: 'error', account, error: `unknown rep email: ${repEmail}` });
          continue;
        }

        const { matchType, matchKey } = classifyMatchKey(account);
        await accountAssignmentsRepo.upsert(req.params.id, matchType, matchKey, rep.id);
        results.push({ row: rowNumber, status: 'ok', account });
      }

      const successCount = results.filter((r) => r.status === 'ok').length;
      return reply.send({ successCount, errorCount: results.length - successCount, results });
    }
  );

  app.get<{ Params: { id: string } }>('/internal/workspaces/:id/accounts', async (req, reply) => {
    const workspace = await workspaceRepo.findById(req.params.id);
    if (!workspace) return reply.code(404).send({ error: 'not_found' });
    return reply.send(await accountAssignmentsRepo.list(req.params.id));
  });

  // KAN-69 — routing decision audit log (storage: KAN-66's migration;
  // writes: KAN-67/68 in gmleads-notification; this route only exposes it).
  app.get<{
    Params: { id: string };
    Querystring: { sessionId?: string; repId?: string; from?: string; to?: string };
  }>('/internal/workspaces/:id/routing/audit', async (req, reply) => {
    const workspace = await workspaceRepo.findById(req.params.id);
    if (!workspace) return reply.code(404).send({ error: 'not_found' });

    const from = parseOptionalDate(req.query.from);
    const to = parseOptionalDate(req.query.to);
    if (from === null || to === null) {
      return reply.code(400).send({ error: 'invalid_request', details: 'from/to must be valid ISO dates' });
    }

    const events = await routingEventsRepo.list(req.params.id, {
      sessionId: req.query.sessionId,
      repId: req.query.repId,
      from: from ?? undefined,
      to: to ?? undefined,
    });
    return reply.send(events);
  });

  // KAN-74 — current (latest per account) scores, highest first.
  app.get<{ Params: { id: string } }>(
    '/internal/workspaces/:id/analytics/account-scores',
    async (req, reply) => {
      const workspace = await workspaceRepo.findById(req.params.id);
      if (!workspace) return reply.code(404).send({ error: 'not_found' });

      const scores = await accountScoresRepo.listCurrent(req.params.id);
      return reply.send(scores);
    }
  );

  // KAN-74 — score history for one account, oldest first (for trend charts).
  app.get<{ Params: { id: string; matchKey: string } }>(
    '/internal/workspaces/:id/analytics/account-scores/:matchKey/history',
    async (req, reply) => {
      const workspace = await workspaceRepo.findById(req.params.id);
      if (!workspace) return reply.code(404).send({ error: 'not_found' });

      const history = await accountScoresRepo.getHistory(
        req.params.id,
        decodeURIComponent(req.params.matchKey)
      );
      return reply.send(history);
    }
  );

  // KAN-74/75 — on-demand recompute (in addition to the nightly scheduled
  // job — see server.ts), useful for demoing/testing without waiting for
  // the schedule to fire.
  app.post<{ Params: { id: string } }>(
    '/internal/workspaces/:id/analytics/recompute',
    async (req, reply) => {
      const workspace = await workspaceRepo.findById(req.params.id);
      if (!workspace) return reply.code(404).send({ error: 'not_found' });

      const [scoredCount, darkFunnelCount] = await Promise.all([
        accountScoringService.recomputeWorkspace(req.params.id),
        darkFunnelService.recomputeWorkspace(req.params.id),
      ]);
      return reply.send({ scoredCount, darkFunnelCount });
    }
  );

  // KAN-75 — current dark-funnel membership list.
  app.get<{ Params: { id: string } }>(
    '/internal/workspaces/:id/analytics/dark-funnel',
    async (req, reply) => {
      const workspace = await workspaceRepo.findById(req.params.id);
      if (!workspace) return reply.code(404).send({ error: 'not_found' });

      const accounts = await darkFunnelRepo.list(req.params.id);
      return reply.send(accounts);
    }
  );

  app.get<{ Params: { id: string } }>(
    '/internal/workspaces/:id/analytics/dark-funnel-settings',
    async (req, reply) => {
      const workspace = await workspaceRepo.findById(req.params.id);
      if (!workspace) return reply.code(404).send({ error: 'not_found' });
      return reply.send(workspace.darkFunnelSettings);
    }
  );

  // Decision 5 — only visitThresholdCount/windowDays are accepted; page-URL
  // patterns stay application configuration, not tenant data.
  app.patch<{ Params: { id: string } }>(
    '/internal/workspaces/:id/analytics/dark-funnel-settings',
    async (req, reply) => {
      const parsed = updateDarkFunnelSettingsRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
      }
      const updated = await workspaceRepo.updateDarkFunnelSettings(req.params.id, parsed.data);
      if (!updated) return reply.code(404).send({ error: 'not_found' });
      return reply.send(updated.darkFunnelSettings);
    }
  );

  app.get<{ Params: { id: string } }>(
    '/internal/workspaces/:id/analytics/digest-schedule',
    async (req, reply) => {
      const workspace = await workspaceRepo.findById(req.params.id);
      if (!workspace) return reply.code(404).send({ error: 'not_found' });
      return reply.send(workspace.digestSchedule);
    }
  );

  app.patch<{ Params: { id: string } }>(
    '/internal/workspaces/:id/analytics/digest-schedule',
    async (req, reply) => {
      const parsed = updateDigestScheduleRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
      }
      const updated = await workspaceRepo.updateDigestSchedule(req.params.id, parsed.data);
      if (!updated) return reply.code(404).send({ error: 'not_found' });
      return reply.send(updated.digestSchedule);
    }
  );

  // KAN-55 (AC3) — self-serve business-hours/timezone config, not under
  // /analytics/ since this is core workspace config, not an analytics
  // setting (unlike dark-funnel-settings/digest-schedule above). The only
  // consumer is gmleads-notification's availability route via
  // AvailabilityEvaluator; this route never evaluates availability itself.
  app.get<{ Params: { id: string } }>(
    '/internal/workspaces/:id/business-hours',
    async (req, reply) => {
      const workspace = await workspaceRepo.findById(req.params.id);
      if (!workspace) return reply.code(404).send({ error: 'not_found' });
      return reply.send({
        businessHours: workspace.businessHours ?? null,
        timezone: workspace.timezone ?? null,
      });
    }
  );

  app.patch<{ Params: { id: string } }>(
    '/internal/workspaces/:id/business-hours',
    async (req, reply) => {
      const parsed = updateBusinessHoursRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
      }
      const updated = await workspaceRepo.updateBusinessHours(req.params.id, parsed.data);
      if (!updated) return reply.code(404).send({ error: 'not_found' });
      return reply.send({ businessHours: updated.businessHours, timezone: updated.timezone });
    }
  );

  // KAN-76 — delivery audit trail (also useful for demoing without waiting
  // a full week for the schedule to fire — see the recompute route above
  // for the scoring/dark-funnel equivalent; digest sends still only fire
  // via the schedule check since a send is externally visible in Slack).
  app.get<{ Params: { id: string } }>(
    '/internal/workspaces/:id/analytics/digest-log',
    async (req, reply) => {
      const workspace = await workspaceRepo.findById(req.params.id);
      if (!workspace) return reply.code(404).send({ error: 'not_found' });
      const deliveries = await digestDeliveriesRepo.list(req.params.id);
      return reply.send(deliveries);
    }
  );

  // KAN-77 — attributed via routing_events.rep_id (Decision 4).
  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>(
    '/internal/workspaces/:id/analytics/rep-performance',
    async (req, reply) => {
      const workspace = await workspaceRepo.findById(req.params.id);
      if (!workspace) return reply.code(404).send({ error: 'not_found' });

      const from = parseOptionalDate(req.query.from);
      const to = parseOptionalDate(req.query.to);
      if (from === null || to === null) {
        return reply.code(400).send({ error: 'invalid_request', details: 'from/to must be valid ISO dates' });
      }

      const stats = await alertResponsesRepo.getRepPerformanceStats(
        req.params.id,
        from ?? undefined,
        to ?? undefined
      );
      return reply.send(stats);
    }
  );

  // KAN-99 — auth endpoints (see ADR-013). Called by gmleads-gateway's
  // dashboard-facing /api/auth/* routes, never directly by a client.
  app.post('/internal/auth/login', async (req, reply) => {
    const parsed = loginRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }
    const secret = jwtSecretOrNull();
    if (!secret) return reply.code(500).send({ error: 'dashboard_auth_not_configured' });

    const { email, password } = parsed.data;
    const user = await usersRepo.findByEmail(email);
    const valid = user
      ? await verifyPassword(user.passwordHash, password)
      : await verifyPassword(await dummyHashPromise, password);
    if (!user || !valid) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    const accessToken = signAccessToken({ sub: user.id, workspaceId: user.workspaceId }, secret);
    const refreshToken = generateRefreshToken();
    await refreshTokensRepo.create(
      user.id,
      hashRefreshToken(refreshToken),
      new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000)
    );
    return reply.code(200).send({ accessToken, refreshToken, workspaceId: user.workspaceId });
  });

  app.post('/internal/auth/refresh', async (req, reply) => {
    const parsed = refreshRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }
    const secret = jwtSecretOrNull();
    if (!secret) return reply.code(500).send({ error: 'dashboard_auth_not_configured' });

    const tokenHash = hashRefreshToken(parsed.data.refreshToken);
    const found = await refreshTokensRepo.findValidByHash(tokenHash);
    const user = found ? await usersRepo.findById(found.userId) : null;
    if (!found || !user) {
      return reply.code(401).send({ error: 'invalid_refresh_token' });
    }

    // Rotate on every use: the presented token is revoked and a new one
    // issued, so a stolen-and-replayed refresh token is caught the next
    // time the legitimate client tries its now-dead copy (see ADR-013).
    await refreshTokensRepo.revoke(found.id);
    const refreshToken = generateRefreshToken();
    await refreshTokensRepo.create(
      user.id,
      hashRefreshToken(refreshToken),
      new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000)
    );
    const accessToken = signAccessToken({ sub: user.id, workspaceId: user.workspaceId }, secret);
    return reply.code(200).send({ accessToken, refreshToken, workspaceId: user.workspaceId });
  });

  app.post('/internal/auth/logout', async (req, reply) => {
    const parsed = logoutRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }
    await refreshTokensRepo.revokeByHash(hashRefreshToken(parsed.data.refreshToken));
    return reply.code(204).send();
  });
}
