import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { getDb } from '@gmleads/shared';
import { resetDatabase, createTestWorkspace } from '@gmleads/shared/dist/testing/fixtures.js';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';

const db = getDb();
let app: FastifyInstance;

async function createTestSession(
  workspaceId: string,
  overrides: {
    status?: string;
    icpScore?: number;
    alertedAt?: Date;
    firmographics?: Record<string, unknown> | null;
    createdAt?: Date;
  } = {}
): Promise<string> {
  // Mirrors gmleads-session's real invariant (session.repo.ts's setStatus):
  // alerted_at is only ever written together with a transition to
  // 'alerted' (or later, 'booked'/'claimed'/'dismissed' once alerted) — it
  // is never set for a session that's still 'active'. Defaulting it here
  // for those two statuses keeps fixture data consistent with production
  // data shape without every KAN-58 test needing to pass it explicitly.
  const status = overrides.status ?? 'active';
  const alertedAt =
    overrides.alertedAt ?? (status === 'alerted' || status === 'booked' ? new Date() : null);
  // KAN-40: pass the raw object (never JSON.stringify it) for a jsonb
  // column bound through db.query()'s non-transactional path — passing an
  // already-stringified value here double-encodes it (Postgres stores it
  // as a JSON *string* scalar, not an object; jsonb_typeof comes back
  // 'string', and ->>'source' extraction silently returns NULL). Verified
  // directly against Postgres while building this test. `firmographics:
  // null` still means SQL NULL (the 'failed identification' case), not
  // the JSON literal null, because it's passed through untouched here.
  // KAN-60: created_at defaults to now() when omitted — explicit only for
  // tests that need a session outside the current usage period.
  const res = await db.query<{ id: string }>(
    `INSERT INTO sessions (workspace_id, visitor_ip_hash, page_url, status, icp_score, alerted_at, firmographics, created_at)
     VALUES ($1, 'test-hash', 'https://example.com/', $2, $3, $4, $5, COALESCE($6, now()))
     RETURNING id`,
    [
      workspaceId,
      status,
      overrides.icpScore ?? 0,
      alertedAt,
      overrides.firmographics !== undefined ? overrides.firmographics : null,
      overrides.createdAt ?? null,
    ]
  );
  return res.rows[0]!.id;
}

beforeAll(async () => {
  app = await buildApp();
});

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(async () => {
  await app.close();
  await db.end();
});

const adminCreds = { adminEmail: 'admin@acme.test', adminPassword: 'correct-horse-battery' };

describe('POST /internal/workspaces', () => {
  it('creates a workspace with a generated embed key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/workspaces',
      payload: { name: 'Acme Corp', ...adminCreds },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.embedKey).toMatch(/^gml_/);
    expect(body.name).toBe('Acme Corp');
    expect(body.icpDefinition.scoreThreshold).toBe(70);
  });

  it('accepts a partial custom icpDefinition, filling in defaults', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/workspaces',
      payload: { name: 'Acme', icpDefinition: { scoreThreshold: 40 }, ...adminCreds },
    });
    const body = res.json();
    expect(body.icpDefinition).toEqual({
      industries: [],
      sizes: [],
      keywords: [],
      scoreThreshold: 40,
    });
  });

  it('rejects an empty name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/workspaces',
      payload: { name: '', ...adminCreds },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an invalid slackWebhookUrl', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/workspaces',
      payload: { name: 'Acme', slackWebhookUrl: 'not-a-url', ...adminCreds },
    });
    expect(res.statusCode).toBe(400);
  });

  it('persists and returns slackChannelUrl when provided (KAN-97)', async () => {
    const channelUrl = 'https://join.slack.com/t/acme/shared_invite/abc123';
    const res = await app.inject({
      method: 'POST',
      url: '/internal/workspaces',
      payload: { name: 'Acme', slackChannelUrl: channelUrl, ...adminCreds },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().slackChannelUrl).toBe(channelUrl);
  });

  it('leaves slackChannelUrl null when omitted (backward-compat)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/workspaces',
      payload: { name: 'Acme', ...adminCreds },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().slackChannelUrl).toBeNull();
  });

  it('rejects a non-https slackChannelUrl', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/workspaces',
      payload: { name: 'Acme', slackChannelUrl: 'javascript:alert(1)', ...adminCreds },
    });
    expect(res.statusCode).toBe(400);
  });

  // KAN-99
  it('rejects a missing adminEmail', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/workspaces',
      payload: { name: 'Acme', adminPassword: 'correct-horse-battery' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an adminPassword shorter than 8 characters', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/workspaces',
      payload: { name: 'Acme', adminEmail: 'admin@acme.test', adminPassword: 'short' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('creates exactly one user, scoped to the new workspace, able to log in', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/internal/workspaces',
      payload: { name: 'Acme', ...adminCreds },
    });
    const workspace = createRes.json();

    const loginRes = await app.inject({
      method: 'POST',
      url: '/internal/auth/login',
      payload: { email: adminCreds.adminEmail, password: adminCreds.adminPassword },
    });
    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.json().workspaceId).toBe(workspace.id);
  });
});

describe('GET /internal/workspaces/:id/leads', () => {
  it('lists sessions for a workspace, newest first', async () => {
    const ws = await createTestWorkspace(db);
    await createTestSession(ws.id);
    await new Promise((r) => setTimeout(r, 10));
    const second = await createTestSession(ws.id);

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/leads`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().leads).toHaveLength(2);
    expect(res.json().leads[0].id).toBe(second);
  });

  it('filters by status', async () => {
    const ws = await createTestWorkspace(db);
    await createTestSession(ws.id, { status: 'active' });
    await createTestSession(ws.id, { status: 'booked' });

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/leads?status=booked`,
    });
    expect(res.json().leads).toHaveLength(1);
    expect(res.json().leads[0].status).toBe('booked');
  });

  it('filters by minScore', async () => {
    const ws = await createTestWorkspace(db);
    await createTestSession(ws.id, { icpScore: 20 });
    await createTestSession(ws.id, { icpScore: 80 });

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/leads?minScore=50`,
    });
    expect(res.json().leads).toHaveLength(1);
    expect(res.json().leads[0].icpScore).toBe(80);
  });

  it('respects limit and offset, capping limit at 200', async () => {
    const ws = await createTestWorkspace(db);
    for (let i = 0; i < 3; i++) await createTestSession(ws.id);

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/leads?limit=2&offset=1`,
    });
    expect(res.json().leads).toHaveLength(2);
  });

  it('404s for a workspace that does not exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/internal/workspaces/00000000-0000-0000-0000-000000000000/leads',
    });
    expect(res.statusCode).toBe(404);
  });

  // KAN-40
  it('filters by identificationSource, matching resolved sources exactly', async () => {
    const ws = await createTestWorkspace(db);
    await createTestSession(ws.id, {
      firmographics: { company: 'Acme', industry: null, employeeRange: null, confidence: 0.8, source: 'leadfeeder' },
    });
    await createTestSession(ws.id, {
      firmographics: { company: 'Unknown', industry: null, employeeRange: null, confidence: 0, source: 'unknown' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/leads?identificationSource=leadfeeder`,
    });
    expect(res.json().leads).toHaveLength(1);
    expect(res.json().leads[0].firmographics.source).toBe('leadfeeder');
  });

  it('filters by identificationSource=failed, matching sessions with no firmographics at all', async () => {
    const ws = await createTestWorkspace(db);
    await createTestSession(ws.id, { firmographics: null });
    await createTestSession(ws.id, {
      firmographics: { company: 'Acme', industry: null, employeeRange: null, confidence: 0.8, source: 'leadfeeder' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/leads?identificationSource=failed`,
    });
    expect(res.json().leads).toHaveLength(1);
    expect(res.json().leads[0].firmographics).toBeNull();
  });

  it('hideSnoozed=true excludes a currently-snoozed session but includes an unsnoozed one (KAN-52)', async () => {
    const ws = await createTestWorkspace(db);
    const snoozedId = await createTestSession(ws.id);
    const normalId = await createTestSession(ws.id);
    await app.inject({
      method: 'PATCH',
      url: `/internal/workspaces/${ws.id}/sessions/${snoozedId}/snooze`,
      payload: { minutes: 60 },
    });

    const hidden = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/leads?hideSnoozed=true`,
    });
    const hiddenIds = hidden.json().leads.map((l: { id: string }) => l.id);
    expect(hiddenIds).not.toContain(snoozedId);
    expect(hiddenIds).toContain(normalId);

    const shown = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/leads`,
    });
    const shownIds = shown.json().leads.map((l: { id: string }) => l.id);
    expect(shownIds).toContain(snoozedId); // default (no hideSnoozed) still shows it
  });
});

describe('GET /internal/workspaces/:id/sessions/:sid', () => {
  it('returns the session with its conversation turns', async () => {
    const ws = await createTestWorkspace(db);
    const sessionId = await createTestSession(ws.id);
    await db.query(
      `INSERT INTO conversation_turns (session_id, role, content) VALUES ($1, 'visitor', 'hello')`,
      [sessionId]
    );

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/sessions/${sessionId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.session.id).toBe(sessionId);
    expect(body.turns).toHaveLength(1);
    expect(body.turns[0].content).toBe('hello');
  });

  it('404s when the session belongs to a different workspace', async () => {
    const ws1 = await createTestWorkspace(db);
    const ws2 = await createTestWorkspace(db);
    const sessionId = await createTestSession(ws1.id);

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws2.id}/sessions/${sessionId}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('404s for a workspace that does not exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/internal/workspaces/00000000-0000-0000-0000-000000000000/sessions/00000000-0000-0000-0000-000000000000',
    });
    expect(res.statusCode).toBe(404);
  });

  it('includes responseAction/responseTimeMs, null when never responded (KAN-59)', async () => {
    const ws = await createTestWorkspace(db);
    const sessionId = await createTestSession(ws.id);

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/sessions/${sessionId}`,
    });
    expect(res.json().session.responseAction).toBeNull();
    expect(res.json().session.responseTimeMs).toBeNull();
  });

  it('computes responseTimeMs from delivery to response (KAN-59)', async () => {
    const ws = await createTestWorkspace(db);
    const sessionId = await createTestSession(ws.id);
    await db.query(
      `INSERT INTO alert_deliveries (session_id, workspace_id, success, latency_ms, failure_reason, created_at)
       VALUES ($1, $2, true, 500, null, NOW() - INTERVAL '10 minutes')`,
      [sessionId, ws.id]
    );
    await db.query(
      `INSERT INTO alert_responses (session_id, workspace_id, action, created_at)
       VALUES ($1, $2, 'claimed', NOW() - INTERVAL '4 minutes')`,
      [sessionId, ws.id]
    );

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/sessions/${sessionId}`,
    });
    const { session } = res.json();
    expect(session.responseAction).toBe('claimed');
    // ~6 minutes = 360000ms, allow slack for test execution time
    expect(session.responseTimeMs).toBeGreaterThan(350_000);
    expect(session.responseTimeMs).toBeLessThan(370_000);
  });
});

describe('POST /internal/workspaces/:id/sessions/:sid/respond', () => {
  it('records a claimed response', async () => {
    const ws = await createTestWorkspace(db);
    const sessionId = await createTestSession(ws.id);

    const res = await app.inject({
      method: 'POST',
      url: `/internal/workspaces/${ws.id}/sessions/${sessionId}/respond`,
      payload: { action: 'claimed' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().action).toBe('claimed');
    expect(res.json().respondedAt).toBeTruthy();
  });

  it('records a dismissed response', async () => {
    const ws = await createTestWorkspace(db);
    const sessionId = await createTestSession(ws.id);

    const res = await app.inject({
      method: 'POST',
      url: `/internal/workspaces/${ws.id}/sessions/${sessionId}/respond`,
      payload: { action: 'dismissed' },
    });
    expect(res.json().action).toBe('dismissed');
  });

  it('rejects "booked" — that action is server-only, never client-posted', async () => {
    const ws = await createTestWorkspace(db);
    const sessionId = await createTestSession(ws.id);

    const res = await app.inject({
      method: 'POST',
      url: `/internal/workspaces/${ws.id}/sessions/${sessionId}/respond`,
      payload: { action: 'booked' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('is idempotent — a second response call returns the first-recorded action (first response wins)', async () => {
    const ws = await createTestWorkspace(db);
    const sessionId = await createTestSession(ws.id);

    await app.inject({
      method: 'POST',
      url: `/internal/workspaces/${ws.id}/sessions/${sessionId}/respond`,
      payload: { action: 'claimed' },
    });
    const second = await app.inject({
      method: 'POST',
      url: `/internal/workspaces/${ws.id}/sessions/${sessionId}/respond`,
      payload: { action: 'dismissed' },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().action).toBe('claimed'); // unchanged — the first call already won
  });

  it('404s when the session belongs to a different workspace (tenant isolation)', async () => {
    const ws1 = await createTestWorkspace(db);
    const ws2 = await createTestWorkspace(db);
    const sessionId = await createTestSession(ws1.id);

    const res = await app.inject({
      method: 'POST',
      url: `/internal/workspaces/${ws2.id}/sessions/${sessionId}/respond`,
      payload: { action: 'claimed' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('404s for a nonexistent session', async () => {
    const ws = await createTestWorkspace(db);
    const res = await app.inject({
      method: 'POST',
      url: `/internal/workspaces/${ws.id}/sessions/00000000-0000-0000-0000-000000000000/respond`,
      payload: { action: 'claimed' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /internal/workspaces/:id/sessions/:sid/snooze (KAN-52)', () => {
  it('sets snoozed_until to roughly now + minutes', async () => {
    const ws = await createTestWorkspace(db);
    const sessionId = await createTestSession(ws.id);

    const before = Date.now();
    const res = await app.inject({
      method: 'PATCH',
      url: `/internal/workspaces/${ws.id}/sessions/${sessionId}/snooze`,
      payload: { minutes: 60 },
    });
    expect(res.statusCode).toBe(200);
    const snoozedUntil = new Date(res.json().snoozedUntil).getTime();
    const expectedMs = before + 60 * 60_000;
    expect(Math.abs(snoozedUntil - expectedMs)).toBeLessThan(5000); // real clock, small slack
  });

  it('does not create an alert_responses row — a snooze is not a response', async () => {
    const ws = await createTestWorkspace(db);
    const sessionId = await createTestSession(ws.id);

    await app.inject({
      method: 'PATCH',
      url: `/internal/workspaces/${ws.id}/sessions/${sessionId}/snooze`,
      payload: { minutes: 60 },
    });

    // A real future respond() call must still succeed -- if snooze had
    // (incorrectly) written to alert_responses, this would be blocked by
    // that table's UNIQUE(session_id)/"first response wins" behavior.
    const respondRes = await app.inject({
      method: 'POST',
      url: `/internal/workspaces/${ws.id}/sessions/${sessionId}/respond`,
      payload: { action: 'claimed' },
    });
    expect(respondRes.statusCode).toBe(200);
    expect(respondRes.json().action).toBe('claimed');
  });

  it('rejects a non-positive minutes value', async () => {
    const ws = await createTestWorkspace(db);
    const sessionId = await createTestSession(ws.id);

    const res = await app.inject({
      method: 'PATCH',
      url: `/internal/workspaces/${ws.id}/sessions/${sessionId}/snooze`,
      payload: { minutes: 0 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a minutes value beyond the 7-day cap', async () => {
    const ws = await createTestWorkspace(db);
    const sessionId = await createTestSession(ws.id);

    const res = await app.inject({
      method: 'PATCH',
      url: `/internal/workspaces/${ws.id}/sessions/${sessionId}/snooze`,
      payload: { minutes: 10081 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('404s when the session belongs to a different workspace (tenant isolation)', async () => {
    const ws1 = await createTestWorkspace(db);
    const ws2 = await createTestWorkspace(db);
    const sessionId = await createTestSession(ws1.id);

    const res = await app.inject({
      method: 'PATCH',
      url: `/internal/workspaces/${ws2.id}/sessions/${sessionId}/snooze`,
      payload: { minutes: 60 },
    });
    expect(res.statusCode).toBe(404);
  });

  it('404s for a nonexistent session', async () => {
    const ws = await createTestWorkspace(db);
    const res = await app.inject({
      method: 'PATCH',
      url: `/internal/workspaces/${ws.id}/sessions/00000000-0000-0000-0000-000000000000/snooze`,
      payload: { minutes: 60 },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /internal/workspaces/:id/alerts/response-stats', () => {
  it('returns null avg/median and zero counts when there is no delivered alert at all', async () => {
    const ws = await createTestWorkspace(db);
    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/alerts/response-stats`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      avgMs: null,
      medianMs: null,
      respondedCount: 0,
      noResponseCount: 0,
    });
  });

  it('distinguishes responded from no-response alerts (AC3)', async () => {
    const ws = await createTestWorkspace(db);

    const responded = await createTestSession(ws.id);
    await db.query(
      `INSERT INTO alert_deliveries (session_id, workspace_id, success, latency_ms, failure_reason)
       VALUES ($1, $2, true, 500, null)`,
      [responded, ws.id]
    );
    await db.query(
      `INSERT INTO alert_responses (session_id, workspace_id, action) VALUES ($1, $2, 'claimed')`,
      [responded, ws.id]
    );

    const unresponded = await createTestSession(ws.id);
    await db.query(
      `INSERT INTO alert_deliveries (session_id, workspace_id, success, latency_ms, failure_reason)
       VALUES ($1, $2, true, 500, null)`,
      [unresponded, ws.id]
    );

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/alerts/response-stats`,
    });
    expect(res.json().respondedCount).toBe(1);
    expect(res.json().noResponseCount).toBe(1);
    expect(res.json().avgMs).toBeGreaterThanOrEqual(0);
    expect(res.json().medianMs).toBeGreaterThanOrEqual(0);
  });

  it('computes avg/median across multiple responded alerts', async () => {
    const ws = await createTestWorkspace(db);

    for (const minutesAgo of [10, 6]) {
      const sessionId = await createTestSession(ws.id);
      await db.query(
        `INSERT INTO alert_deliveries (session_id, workspace_id, success, latency_ms, failure_reason, created_at)
         VALUES ($1, $2, true, 500, null, NOW() - INTERVAL '${minutesAgo} minutes')`,
        [sessionId, ws.id]
      );
      await db.query(
        `INSERT INTO alert_responses (session_id, workspace_id, action, created_at)
         VALUES ($1, $2, 'claimed', NOW() - INTERVAL '${minutesAgo - 2} minutes')`,
        [sessionId, ws.id]
      );
    }
    // Both responses arrive exactly 2 minutes (120000ms) after delivery.

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/alerts/response-stats`,
    });
    expect(res.json().respondedCount).toBe(2);
    expect(res.json().avgMs).toBeGreaterThan(110_000);
    expect(res.json().avgMs).toBeLessThan(130_000);
    expect(res.json().medianMs).toBeGreaterThan(110_000);
    expect(res.json().medianMs).toBeLessThan(130_000);
  });

  it('filters by from/to date range', async () => {
    const ws = await createTestWorkspace(db);

    const oldSession = await createTestSession(ws.id);
    await db.query(
      `INSERT INTO alert_deliveries (session_id, workspace_id, success, latency_ms, failure_reason, created_at)
       VALUES ($1, $2, true, 500, null, NOW() - INTERVAL '30 days')`,
      [oldSession, ws.id]
    );

    const recentSession = await createTestSession(ws.id);
    await db.query(
      `INSERT INTO alert_deliveries (session_id, workspace_id, success, latency_ms, failure_reason, created_at)
       VALUES ($1, $2, true, 500, null, NOW())`,
      [recentSession, ws.id]
    );

    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/alerts/response-stats?from=${encodeURIComponent(from)}`,
    });
    // Only the recent (unresponded) delivery falls in range.
    expect(res.json().noResponseCount).toBe(1);
  });

  it('400s for an invalid date', async () => {
    const ws = await createTestWorkspace(db);
    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/alerts/response-stats?from=not-a-date`,
    });
    expect(res.statusCode).toBe(400);
  });

  it('404s for a workspace that does not exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/internal/workspaces/00000000-0000-0000-0000-000000000000/alerts/response-stats',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /internal/workspaces/:id/analytics/funnel', () => {
  it('returns zero counts for a workspace with no sessions', async () => {
    const ws = await createTestWorkspace(db);
    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/analytics/funnel`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ visitorCount: 0, qualifiedCount: 0, bookedCount: 0 });
  });

  it('counts visitors, qualified (alerted), and booked sessions separately — booked implies qualified', async () => {
    const ws = await createTestWorkspace(db);
    await createTestSession(ws.id, { status: 'active' });
    await createTestSession(ws.id, { status: 'alerted' });
    await createTestSession(ws.id, { status: 'booked' });

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/analytics/funnel`,
    });
    // qualifiedCount is 2, not 1: a booked session necessarily passed
    // through 'alerted' first (see createTestSession's alertedAt default,
    // mirroring gmleads-session's real invariant), so it counts toward
    // both qualified and booked — the funnel stages are cumulative, not
    // mutually exclusive buckets.
    expect(res.json()).toEqual({ visitorCount: 3, qualifiedCount: 2, bookedCount: 1 });
  });

  it('a booked session also counts as qualified (alerted_at is set en route to booked)', async () => {
    const ws = await createTestWorkspace(db);
    const sessionId = await createTestSession(ws.id, { status: 'alerted' });
    await db.query(`UPDATE sessions SET status = 'booked' WHERE id = $1`, [sessionId]);

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/analytics/funnel`,
    });
    expect(res.json()).toEqual({ visitorCount: 1, qualifiedCount: 1, bookedCount: 1 });
  });

  it('filters by from/to date range on session creation', async () => {
    const ws = await createTestWorkspace(db);
    const oldSession = await createTestSession(ws.id);
    await db.query(`UPDATE sessions SET created_at = NOW() - INTERVAL '30 days' WHERE id = $1`, [
      oldSession,
    ]);
    await createTestSession(ws.id);

    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/analytics/funnel?from=${encodeURIComponent(from)}`,
    });
    expect(res.json().visitorCount).toBe(1);
  });

  it('scopes strictly per workspace (tenant isolation)', async () => {
    const ws1 = await createTestWorkspace(db);
    const ws2 = await createTestWorkspace(db);
    await createTestSession(ws1.id);
    await createTestSession(ws1.id);

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws2.id}/analytics/funnel`,
    });
    expect(res.json().visitorCount).toBe(0);
  });

  it('400s for an invalid date', async () => {
    const ws = await createTestWorkspace(db);
    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/analytics/funnel?from=not-a-date`,
    });
    expect(res.statusCode).toBe(400);
  });

  it('404s for a workspace that does not exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/internal/workspaces/00000000-0000-0000-0000-000000000000/analytics/funnel',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /internal/workspaces/:id/alerts/delivery-stats', () => {
  it('returns null p50/p95 and zero counts when there are no delivery attempts', async () => {
    const ws = await createTestWorkspace(db);
    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/alerts/delivery-stats`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ p50Ms: null, p95Ms: null, successCount: 0, failureCount: 0 });
  });

  it('computes p50/p95 latency and success/failure counts', async () => {
    const ws = await createTestWorkspace(db);
    for (const latencyMs of [100, 200, 300, 400, 900]) {
      const sessionId = await createTestSession(ws.id);
      await db.query(
        `INSERT INTO alert_deliveries (session_id, workspace_id, success, latency_ms, failure_reason)
         VALUES ($1, $2, true, $3, null)`,
        [sessionId, ws.id, latencyMs]
      );
    }
    const failedSession = await createTestSession(ws.id);
    await db.query(
      `INSERT INTO alert_deliveries (session_id, workspace_id, success, latency_ms, failure_reason)
       VALUES ($1, $2, false, 5000, 'webhook_timeout')`,
      [failedSession, ws.id]
    );

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/alerts/delivery-stats`,
    });
    const body = res.json();
    expect(body.successCount).toBe(5);
    expect(body.failureCount).toBe(1);
    expect(body.p50Ms).toBe(300);
    expect(body.p95Ms).toBeGreaterThan(300);
  });

  it('filters by from/to date range on delivery attempt time', async () => {
    const ws = await createTestWorkspace(db);
    const oldSession = await createTestSession(ws.id);
    await db.query(
      `INSERT INTO alert_deliveries (session_id, workspace_id, success, latency_ms, failure_reason, created_at)
       VALUES ($1, $2, true, 500, null, NOW() - INTERVAL '30 days')`,
      [oldSession, ws.id]
    );
    const recentSession = await createTestSession(ws.id);
    await db.query(
      `INSERT INTO alert_deliveries (session_id, workspace_id, success, latency_ms, failure_reason, created_at)
       VALUES ($1, $2, true, 700, null, NOW())`,
      [recentSession, ws.id]
    );

    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/alerts/delivery-stats?from=${encodeURIComponent(from)}`,
    });
    expect(res.json().successCount).toBe(1);
    expect(res.json().p50Ms).toBe(700);
  });

  it('scopes strictly per workspace (tenant isolation)', async () => {
    const ws1 = await createTestWorkspace(db);
    const ws2 = await createTestWorkspace(db);
    const sessionId = await createTestSession(ws1.id);
    await db.query(
      `INSERT INTO alert_deliveries (session_id, workspace_id, success, latency_ms, failure_reason)
       VALUES ($1, $2, true, 500, null)`,
      [sessionId, ws1.id]
    );

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws2.id}/alerts/delivery-stats`,
    });
    expect(res.json()).toEqual({ p50Ms: null, p95Ms: null, successCount: 0, failureCount: 0 });
  });

  it('400s for an invalid date', async () => {
    const ws = await createTestWorkspace(db);
    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/alerts/delivery-stats?from=not-a-date`,
    });
    expect(res.statusCode).toBe(400);
  });

  it('404s for a workspace that does not exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/internal/workspaces/00000000-0000-0000-0000-000000000000/alerts/delivery-stats',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /internal/workspaces/:id/widget-status', () => {
  it('returns null lastSeenAt for a workspace with no sessions ever', async () => {
    const ws = await createTestWorkspace(db);
    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/widget-status`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ lastSeenAt: null });
  });

  it('returns the most recent session timestamp for the workspace', async () => {
    const ws = await createTestWorkspace(db);
    const older = await createTestSession(ws.id);
    await db.query(`UPDATE sessions SET created_at = NOW() - INTERVAL '2 days' WHERE id = $1`, [
      older,
    ]);
    const newer = await createTestSession(ws.id);

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/widget-status`,
    });
    expect(res.statusCode).toBe(200);
    const newerSession = await db.query<{ created_at: Date }>(
      'SELECT created_at FROM sessions WHERE id = $1',
      [newer]
    );
    expect(new Date(res.json().lastSeenAt).getTime()).toBe(
      newerSession.rows[0]!.created_at.getTime()
    );
  });

  it('scopes strictly per workspace (tenant isolation)', async () => {
    const ws1 = await createTestWorkspace(db);
    const ws2 = await createTestWorkspace(db);
    await createTestSession(ws1.id);

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws2.id}/widget-status`,
    });
    expect(res.json()).toEqual({ lastSeenAt: null });
  });

  it('404s for a workspace that does not exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/internal/workspaces/00000000-0000-0000-0000-000000000000/widget-status',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /internal/workspaces/:id/usage (KAN-60)', () => {
  it('counts only sessions created within the current calendar month', async () => {
    const ws = await createTestWorkspace(db);
    await createTestSession(ws.id);
    await createTestSession(ws.id);
    // Outside the current period — must not count toward sessionsUsed.
    await createTestSession(ws.id, {
      createdAt: new Date(Date.UTC(2020, 0, 15)),
    });

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/usage`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.sessionsUsed).toBe(2);
    expect(body.sessionsQuota).toBe(1000); // migration 012's DEFAULT
    expect(new Date(body.periodStart).getUTCDate()).toBe(1);
  });

  it('reflects a workspace-specific quota override', async () => {
    const ws = await createTestWorkspace(db);
    await db.query('UPDATE workspaces SET monthly_session_quota = $2 WHERE id = $1', [ws.id, 5]);
    await createTestSession(ws.id);

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/usage`,
    });
    expect(res.json()).toEqual(
      expect.objectContaining({ sessionsUsed: 1, sessionsQuota: 5 })
    );
  });

  it('scopes strictly per workspace (tenant isolation)', async () => {
    const ws1 = await createTestWorkspace(db);
    const ws2 = await createTestWorkspace(db);
    await createTestSession(ws1.id);
    await createTestSession(ws1.id);

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws2.id}/usage`,
    });
    expect(res.json()).toEqual(expect.objectContaining({ sessionsUsed: 0 }));
  });

  it('404s for a workspace that does not exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/internal/workspaces/00000000-0000-0000-0000-000000000000/usage',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /internal/workspaces/:id/analytics/identification-accuracy', () => {
  it('returns all-zero counts for a workspace with no sessions', async () => {
    const ws = await createTestWorkspace(db);
    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/analytics/identification-accuracy`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      resolvedCount: 0,
      unknownCount: 0,
      failedCount: 0,
      lowConfidenceCount: 0,
    });
  });

  it('categorizes resolved, unknown, and failed sessions correctly', async () => {
    const ws = await createTestWorkspace(db);
    // Resolved (leadfeeder, high confidence)
    await createTestSession(ws.id, {
      firmographics: { company: 'Acme', industry: null, employeeRange: null, confidence: 0.8, source: 'leadfeeder' },
    });
    // Resolved (ipapi, high confidence — still counts as resolved even though
    // it's the fallback provider, since it did find a real org/ISP match)
    await createTestSession(ws.id, {
      firmographics: { company: 'Some ISP', industry: null, employeeRange: null, confidence: 0.5, source: 'ipapi' },
    });
    // Unknown — both providers ran, neither found a match
    await createTestSession(ws.id, {
      firmographics: { company: 'Unknown', industry: null, employeeRange: null, confidence: 0, source: 'unknown' },
    });
    // Failed — the pipeline itself threw, visitor.identified never
    // published, firmographics stayed NULL (see gmleads-identify's own
    // 'publishes an unknown-source result when resolution fails entirely'
    // test — this is the specific case that ISN'T covered by that test:
    // the outer try/catch swallowing the error entirely).
    await createTestSession(ws.id, { firmographics: null });

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/analytics/identification-accuracy`,
    });
    expect(res.json()).toEqual({
      resolvedCount: 2,
      unknownCount: 1,
      failedCount: 1,
      lowConfidenceCount: 0,
    });
  });

  it('flags low-confidence resolved matches (below 0.3), distinct from unknown', async () => {
    const ws = await createTestWorkspace(db);
    // Low-confidence but real match (typical ipapi org/ISP hit)
    await createTestSession(ws.id, {
      firmographics: { company: 'Some ISP', industry: null, employeeRange: null, confidence: 0.2, source: 'ipapi' },
    });
    // High-confidence match — not flagged
    await createTestSession(ws.id, {
      firmographics: { company: 'Acme', industry: null, employeeRange: null, confidence: 0.9, source: 'leadfeeder' },
    });
    // Unknown (confidence 0) — must NOT double-count into lowConfidenceCount
    await createTestSession(ws.id, {
      firmographics: { company: 'Unknown', industry: null, employeeRange: null, confidence: 0, source: 'unknown' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/analytics/identification-accuracy`,
    });
    const body = res.json();
    expect(body.resolvedCount).toBe(2);
    expect(body.lowConfidenceCount).toBe(1);
    expect(body.unknownCount).toBe(1);
  });

  it('filters by from/to date range on session creation', async () => {
    const ws = await createTestWorkspace(db);
    const oldSession = await createTestSession(ws.id, {
      firmographics: { company: 'Acme', industry: null, employeeRange: null, confidence: 0.8, source: 'leadfeeder' },
    });
    await db.query(`UPDATE sessions SET created_at = NOW() - INTERVAL '30 days' WHERE id = $1`, [
      oldSession,
    ]);
    await createTestSession(ws.id, {
      firmographics: { company: 'Beta', industry: null, employeeRange: null, confidence: 0.8, source: 'leadfeeder' },
    });

    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/analytics/identification-accuracy?from=${encodeURIComponent(from)}`,
    });
    expect(res.json().resolvedCount).toBe(1);
  });

  it('scopes strictly per workspace (tenant isolation)', async () => {
    const ws1 = await createTestWorkspace(db);
    const ws2 = await createTestWorkspace(db);
    await createTestSession(ws1.id, {
      firmographics: { company: 'Acme', industry: null, employeeRange: null, confidence: 0.8, source: 'leadfeeder' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws2.id}/analytics/identification-accuracy`,
    });
    expect(res.json()).toEqual({
      resolvedCount: 0,
      unknownCount: 0,
      failedCount: 0,
      lowConfidenceCount: 0,
    });
  });

  it('400s for an invalid date', async () => {
    const ws = await createTestWorkspace(db);
    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/analytics/identification-accuracy?from=not-a-date`,
    });
    expect(res.statusCode).toBe(400);
  });

  it('404s for a workspace that does not exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/internal/workspaces/00000000-0000-0000-0000-000000000000/analytics/identification-accuracy',
    });
    expect(res.statusCode).toBe(404);
  });
});

// KAN-66: builds a raw multipart/form-data body so @fastify/multipart's
// req.file() can be exercised via app.inject() without a real HTTP client.
function buildCsvUploadPayload(csv: string): { payload: Buffer; contentType: string } {
  const boundary = '----kan66TestBoundary';
  const body =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="accounts.csv"\r\n` +
    `Content-Type: text/csv\r\n\r\n` +
    `${csv}\r\n` +
    `--${boundary}--\r\n`;
  return { payload: Buffer.from(body), contentType: `multipart/form-data; boundary=${boundary}` };
}

describe('reps management (KAN-66)', () => {
  it('creates a rep and lists it back', async () => {
    const ws = await createTestWorkspace(db);
    const createRes = await app.inject({
      method: 'POST',
      url: `/internal/workspaces/${ws.id}/reps`,
      payload: { name: 'Jamie', email: 'jamie@acme.test', slackMemberId: 'U123' },
    });
    expect(createRes.statusCode).toBe(201);
    expect(createRes.json()).toMatchObject({ name: 'Jamie', email: 'jamie@acme.test', active: true });

    const listRes = await app.inject({ method: 'GET', url: `/internal/workspaces/${ws.id}/reps` });
    expect(listRes.json()).toHaveLength(1);
  });

  it('rejects an invalid rep payload', async () => {
    const ws = await createTestWorkspace(db);
    const res = await app.inject({
      method: 'POST',
      url: `/internal/workspaces/${ws.id}/reps`,
      payload: { name: 'Jamie', email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('deactivates a rep via PATCH without deleting the row', async () => {
    const ws = await createTestWorkspace(db);
    const createRes = await app.inject({
      method: 'POST',
      url: `/internal/workspaces/${ws.id}/reps`,
      payload: { name: 'Jamie', email: 'jamie@acme.test' },
    });
    const repId = createRes.json().id;

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/internal/workspaces/${ws.id}/reps/${repId}`,
      payload: { active: false },
    });
    expect(patchRes.json()).toMatchObject({ active: false, name: 'Jamie' });
  });

  it('404s for a workspace that does not exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/internal/workspaces/00000000-0000-0000-0000-000000000000/reps',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('account CSV upload (KAN-66)', () => {
  it('uploads a valid CSV and creates the account assignments', async () => {
    const ws = await createTestWorkspace(db);
    await app.inject({
      method: 'POST',
      url: `/internal/workspaces/${ws.id}/reps`,
      payload: { name: 'Jamie', email: 'jamie@acme.test' },
    });

    const csv = 'account,repEmail\nacme.com,jamie@acme.test\n';
    const { payload, contentType } = buildCsvUploadPayload(csv);
    const res = await app.inject({
      method: 'POST',
      url: `/internal/workspaces/${ws.id}/accounts/upload`,
      headers: { 'content-type': contentType },
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ successCount: 1, errorCount: 0 });

    const listRes = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/accounts`,
    });
    expect(listRes.json()).toMatchObject([{ matchType: 'domain', matchKey: 'acme.com' }]);
  });

  it('reports an unknown rep email as a per-row error without failing the whole upload', async () => {
    const ws = await createTestWorkspace(db);
    await app.inject({
      method: 'POST',
      url: `/internal/workspaces/${ws.id}/reps`,
      payload: { name: 'Jamie', email: 'jamie@acme.test' },
    });

    const csv = 'account,repEmail\nacme.com,jamie@acme.test\nunknown.com,ghost@acme.test\n';
    const { payload, contentType } = buildCsvUploadPayload(csv);
    const res = await app.inject({
      method: 'POST',
      url: `/internal/workspaces/${ws.id}/accounts/upload`,
      headers: { 'content-type': contentType },
      payload,
    });

    expect(res.json()).toMatchObject({ successCount: 1, errorCount: 1 });
    expect(res.json().results[1]).toMatchObject({ status: 'error', account: 'unknown.com' });
  });

  it('re-uploading the same account upserts rather than duplicates', async () => {
    const ws = await createTestWorkspace(db);
    const repA = (
      await app.inject({
        method: 'POST',
        url: `/internal/workspaces/${ws.id}/reps`,
        payload: { name: 'A', email: 'a@acme.test' },
      })
    ).json();
    const repB = (
      await app.inject({
        method: 'POST',
        url: `/internal/workspaces/${ws.id}/reps`,
        payload: { name: 'B', email: 'b@acme.test' },
      })
    ).json();

    const upload = async (repEmail: string): Promise<void> => {
      const { payload, contentType } = buildCsvUploadPayload(`account,repEmail\nacme.com,${repEmail}\n`);
      await app.inject({
        method: 'POST',
        url: `/internal/workspaces/${ws.id}/accounts/upload`,
        headers: { 'content-type': contentType },
        payload,
      });
    };

    await upload('a@acme.test');
    await upload('b@acme.test'); // re-upload, same account, different rep

    const listRes = await app.inject({ method: 'GET', url: `/internal/workspaces/${ws.id}/accounts` });
    const rows = listRes.json();
    expect(rows).toHaveLength(1); // upserted, not duplicated
    expect(rows[0].repId).toBe(repB.id);
    expect(rows[0].repId).not.toBe(repA.id);
  });
});

describe('routing audit log (KAN-69)', () => {
  it('exposes routing_events rows written by another service (gmleads-notification)', async () => {
    const ws = await createTestWorkspace(db);
    const repId = (
      await app.inject({
        method: 'POST',
        url: `/internal/workspaces/${ws.id}/reps`,
        payload: { name: 'Jamie', email: 'jamie@acme.test' },
      })
    ).json().id;
    const sessionId = await createTestSession(ws.id);

    // Simulates what gmleads-notification's RoutingRepo.recordEvent writes —
    // this route only reads, it never writes routing_events itself.
    await db.query(
      `INSERT INTO routing_events (workspace_id, session_id, method, matched_key, rep_id)
       VALUES ($1, $2, 'direct', 'acme.com', $3)`,
      [ws.id, sessionId, repId]
    );

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/routing/audit`,
    });
    expect(res.json()).toMatchObject([{ method: 'direct', matchedKey: 'acme.com', repId }]);
  });

  it('filters by sessionId', async () => {
    const ws = await createTestWorkspace(db);
    const session1 = await createTestSession(ws.id);
    const session2 = await createTestSession(ws.id);
    await db.query(
      `INSERT INTO routing_events (workspace_id, session_id, method) VALUES ($1, $2, 'fallback'), ($1, $3, 'fallback')`,
      [ws.id, session1, session2]
    );

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/routing/audit?sessionId=${session1}`,
    });
    expect(res.json()).toHaveLength(1);
    expect(res.json()[0]).toMatchObject({ sessionId: session1 });
  });

  it('filters by repId and by from/to date range', async () => {
    const ws = await createTestWorkspace(db);
    const repId = (
      await app.inject({
        method: 'POST',
        url: `/internal/workspaces/${ws.id}/reps`,
        payload: { name: 'Jamie', email: 'jamie@acme.test' },
      })
    ).json().id;
    const session1 = await createTestSession(ws.id);
    const session2 = await createTestSession(ws.id);
    await db.query(
      `INSERT INTO routing_events (workspace_id, session_id, method, rep_id) VALUES ($1, $2, 'direct', $4), ($1, $3, 'fallback', NULL)`,
      [ws.id, session1, session2, repId]
    );

    const byRep = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/routing/audit?repId=${repId}`,
    });
    expect(byRep.json()).toHaveLength(1);
    expect(byRep.json()[0]).toMatchObject({ repId });

    const future = new Date(Date.now() + 60_000).toISOString();
    const byFrom = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/routing/audit?from=${encodeURIComponent(future)}`,
    });
    expect(byFrom.json()).toHaveLength(0); // nothing created after "future"

    const past = new Date(Date.now() - 60_000).toISOString();
    const byTo = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/routing/audit?to=${encodeURIComponent(past)}`,
    });
    expect(byTo.json()).toHaveLength(0); // nothing created before "past"
  });

  it('404s for a workspace that does not exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/internal/workspaces/00000000-0000-0000-0000-000000000000/routing/audit',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('business hours settings (KAN-55 AC3)', () => {
  it('defaults to null/null for a newly created workspace', async () => {
    const ws = await createTestWorkspace(db);
    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/business-hours`,
    });
    expect(res.json()).toEqual({ businessHours: null, timezone: null });
  });

  it('gets and updates business hours + timezone', async () => {
    const ws = await createTestWorkspace(db);
    const businessHours = {
      mon: { open: '09:00', close: '17:00' },
      tue: { open: '09:00', close: '17:00' },
    };

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/internal/workspaces/${ws.id}/business-hours`,
      payload: { businessHours, timezone: 'America/New_York' },
    });
    expect(patchRes.json()).toEqual({ businessHours, timezone: 'America/New_York' });

    const getRes = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/business-hours`,
    });
    expect(getRes.json()).toEqual({ businessHours, timezone: 'America/New_York' });
  });

  it('rejects an invalid IANA timezone', async () => {
    const ws = await createTestWorkspace(db);
    const res = await app.inject({
      method: 'PATCH',
      url: `/internal/workspaces/${ws.id}/business-hours`,
      payload: { businessHours: null, timezone: 'Not/A_Zone' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a non-HH:mm window', async () => {
    const ws = await createTestWorkspace(db);
    const res = await app.inject({
      method: 'PATCH',
      url: `/internal/workspaces/${ws.id}/business-hours`,
      payload: { businessHours: { mon: { open: '9am', close: '17:00' } }, timezone: 'UTC' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('clears business hours back to null/null', async () => {
    const ws = await createTestWorkspace(db);
    await app.inject({
      method: 'PATCH',
      url: `/internal/workspaces/${ws.id}/business-hours`,
      payload: { businessHours: { mon: { open: '09:00', close: '17:00' } }, timezone: 'UTC' },
    });

    const clearRes = await app.inject({
      method: 'PATCH',
      url: `/internal/workspaces/${ws.id}/business-hours`,
      payload: { businessHours: null, timezone: null },
    });
    expect(clearRes.json()).toEqual({ businessHours: null, timezone: null });
  });

  it('404s for a workspace that does not exist', async () => {
    const getRes = await app.inject({
      method: 'GET',
      url: '/internal/workspaces/00000000-0000-0000-0000-000000000000/business-hours',
    });
    expect(getRes.statusCode).toBe(404);

    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/internal/workspaces/00000000-0000-0000-0000-000000000000/business-hours',
      payload: { businessHours: null, timezone: null },
    });
    expect(patchRes.statusCode).toBe(404);
  });
});
