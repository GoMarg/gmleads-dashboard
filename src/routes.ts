import type { FastifyInstance } from 'fastify';
import {
  getDb,
  createWorkspaceRequestSchema,
  loginRequestSchema,
  refreshRequestSchema,
  logoutRequestSchema,
  respondToAlertRequestSchema,
  hashPassword,
  verifyPassword,
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  REFRESH_TOKEN_TTL_SECONDS,
  type SessionStatus,
} from '@gmleads/shared';
import { WorkspaceRepo } from './db/workspace.repo.js';
import { LeadsRepo } from './db/leads.repo.js';
import { UsersRepo } from './db/users.repo.js';
import { RefreshTokensRepo } from './db/refresh-tokens.repo.js';
import { AlertResponsesRepo } from './db/alert-responses.repo.js';
import { AnalyticsRepo } from './db/analytics.repo.js';

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
    Querystring: { status?: string; minScore?: string; limit?: string; offset?: string };
  }>('/internal/workspaces/:id/leads', async (req, reply) => {
    const workspace = await workspaceRepo.findById(req.params.id);
    if (!workspace) return reply.code(404).send({ error: 'not_found' });

    const { status, minScore, limit, offset } = req.query;
    const leads = await leadsRepo.listLeads(req.params.id, {
      status: status as SessionStatus | undefined,
      minScore: minScore ? Number(minScore) : undefined,
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
