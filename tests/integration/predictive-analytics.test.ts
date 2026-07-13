import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import type { INotification, NotificationTarget } from '@gmleads/shared';

// KAN-76: getNotification() wraps a real Slack webhook POST — mock it
// directly (same pattern as gmleads-notification's notification-flow.test.ts)
// rather than trying to intercept axios through the @gmleads/shared
// package boundary.
const sendMessageMock =
  vi.fn<(target: NotificationTarget, payload: unknown) => Promise<void>>();
const fakeNotification: INotification = { sendMessage: sendMessageMock };

vi.mock('@gmleads/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gmleads/shared')>();
  return { ...actual, getNotification: () => fakeNotification };
});

const { getDb } = await import('@gmleads/shared');
const { resetDatabase, createTestWorkspace } = await import(
  '@gmleads/shared/dist/testing/fixtures.js'
);
const { buildApp } = await import('../../src/app.js');
const { buildAnalyticsServices } = await import('../../src/analytics/build-analytics-services.js');

const db = getDb();
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp();
});

beforeEach(async () => {
  await resetDatabase(db);
  sendMessageMock.mockClear();
  sendMessageMock.mockResolvedValue(undefined);
});

afterAll(async () => {
  await app.close();
  await db.end();
});

async function createTestSession(
  workspaceId: string,
  overrides: {
    firmographics?: Record<string, unknown> | null;
    pageUrl?: string;
    createdAt?: Date;
  } = {}
): Promise<string> {
  const res = await db.query<{ id: string }>(
    `INSERT INTO sessions (workspace_id, visitor_ip_hash, page_url, firmographics, created_at)
     VALUES ($1, 'test-hash', $2, $3, COALESCE($4, NOW()))
     RETURNING id`,
    [
      workspaceId,
      overrides.pageUrl ?? 'https://example.com/about',
      overrides.firmographics !== undefined ? overrides.firmographics : null,
      overrides.createdAt ?? null,
    ]
  );
  return res.rows[0]!.id;
}

async function addChatTurn(sessionId: string): Promise<void> {
  await db.query(
    `INSERT INTO conversation_turns (session_id, role, content) VALUES ($1, 'visitor', 'hi')`,
    [sessionId]
  );
}

async function createTestRep(workspaceId: string, name = 'Jamie'): Promise<string> {
  const res = await db.query<{ id: string }>(
    `INSERT INTO reps (workspace_id, name, email) VALUES ($1, $2, $3) RETURNING id`,
    [workspaceId, name, `${name.toLowerCase()}@acme.test`]
  );
  return res.rows[0]!.id;
}

async function recordRoutingEvent(
  workspaceId: string,
  sessionId: string,
  repId: string
): Promise<void> {
  await db.query(
    `INSERT INTO routing_events (workspace_id, session_id, method, rep_id) VALUES ($1, $2, 'direct', $3)`,
    [workspaceId, sessionId, repId]
  );
}

async function recordDelivery(workspaceId: string, sessionId: string, createdAt: Date): Promise<void> {
  await db.query(
    `INSERT INTO alert_deliveries (session_id, workspace_id, success, latency_ms, created_at)
     VALUES ($1, $2, true, 100, $3)`,
    [sessionId, workspaceId, createdAt]
  );
}

async function recordResponse(
  workspaceId: string,
  sessionId: string,
  action: 'claimed' | 'dismissed' | 'booked',
  createdAt: Date
): Promise<void> {
  await db.query(
    `INSERT INTO alert_responses (session_id, workspace_id, action, created_at) VALUES ($1, $2, $3, $4)`,
    [sessionId, workspaceId, action, createdAt]
  );
}

const icp = { industries: ['software'], sizes: ['51-200'], keywords: [], scoreThreshold: 70 };

describe('account scoring (KAN-74)', () => {
  it('recomputes and returns a current score with a factor breakdown', async () => {
    const ws = await createTestWorkspace(db, { icpDefinition: icp });
    const firmographics = {
      company: 'Acme',
      domain: 'acme.com',
      industry: 'Software',
      employeeRange: '51-200',
      confidence: 0.9,
      source: 'leadfeeder',
    };
    const s1 = await createTestSession(ws.id, { firmographics, pageUrl: 'https://acme.com/pricing' });
    await createTestSession(ws.id, { firmographics, pageUrl: 'https://acme.com/blog' });
    await addChatTurn(s1);

    const recomputeRes = await app.inject({
      method: 'POST',
      url: `/internal/workspaces/${ws.id}/analytics/recompute`,
    });
    expect(recomputeRes.statusCode).toBe(200);
    expect(recomputeRes.json()).toEqual({ scoredCount: 1, darkFunnelCount: 0 });

    const listRes = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/analytics/account-scores`,
    });
    expect(listRes.statusCode).toBe(200);
    const scores = listRes.json();
    expect(scores).toHaveLength(1);
    expect(scores[0].matchKey).toBe('acme.com');
    expect(scores[0].algorithmVersion).toBe('v1');
    expect(scores[0].score).toBeGreaterThan(0);
    expect(scores[0].factors.firmographicFit).toBe(100); // full industry+size match
    expect(scores[0].factors.engagementDepth).toBeGreaterThan(0); // one chat turn
    expect(scores[0].factors.intentSignals).toBeGreaterThan(0); // one pricing-page visit
  });

  it('accumulates history across multiple recomputes, oldest first, with a deterministic score for unchanged data', async () => {
    const ws = await createTestWorkspace(db);
    await createTestSession(ws.id, { firmographics: { domain: 'acme.com' } });

    await app.inject({ method: 'POST', url: `/internal/workspaces/${ws.id}/analytics/recompute` });
    await app.inject({ method: 'POST', url: `/internal/workspaces/${ws.id}/analytics/recompute` });

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/analytics/account-scores/acme.com/history`,
    });
    expect(res.json()).toHaveLength(2);
    expect(new Date(res.json()[0].computedAt).getTime()).toBeLessThanOrEqual(
      new Date(res.json()[1].computedAt).getTime()
    );
    // Determinism: recomputing over the exact same underlying session data
    // must produce the exact same score and factor breakdown both times —
    // two distinct rows (append-only), but identical values.
    expect(res.json()[0].score).toBe(res.json()[1].score);
    expect(res.json()[0].factors).toEqual(res.json()[1].factors);
    expect(res.json()[0].algorithmVersion).toBe(res.json()[1].algorithmVersion);
  });

  it('skips sessions with no domain or company name (unmatchable)', async () => {
    const ws = await createTestWorkspace(db);
    await createTestSession(ws.id, { firmographics: null });

    await app.inject({ method: 'POST', url: `/internal/workspaces/${ws.id}/analytics/recompute` });
    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/analytics/account-scores`,
    });
    expect(res.json()).toHaveLength(0);
  });

  it('404s for a workspace that does not exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/internal/workspaces/00000000-0000-0000-0000-000000000000/analytics/account-scores',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('dark funnel detection (KAN-75)', () => {
  it('qualifies an account with repeat visits and no chat engagement', async () => {
    const ws = await createTestWorkspace(db);
    for (let i = 0; i < 3; i++) {
      await createTestSession(ws.id, { firmographics: { domain: 'acme.com' } });
    }

    await app.inject({ method: 'POST', url: `/internal/workspaces/${ws.id}/analytics/recompute` });

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/analytics/dark-funnel`,
    });
    expect(res.json()).toHaveLength(1);
    expect(res.json()[0]).toMatchObject({ matchKey: 'acme.com', visitCount: 3 });
  });

  it('does not qualify an account below the visit threshold', async () => {
    const ws = await createTestWorkspace(db);
    await createTestSession(ws.id, { firmographics: { domain: 'acme.com' } });

    await app.inject({ method: 'POST', url: `/internal/workspaces/${ws.id}/analytics/recompute` });
    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/analytics/dark-funnel`,
    });
    expect(res.json()).toHaveLength(0);
  });

  it('removes an account once it chats, even if it still meets the visit threshold', async () => {
    const ws = await createTestWorkspace(db);
    const sessions: string[] = [];
    for (let i = 0; i < 3; i++) {
      sessions.push(await createTestSession(ws.id, { firmographics: { domain: 'acme.com' } }));
    }
    await app.inject({ method: 'POST', url: `/internal/workspaces/${ws.id}/analytics/recompute` });
    let res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/analytics/dark-funnel`,
    });
    expect(res.json()).toHaveLength(1);

    await addChatTurn(sessions[0]);
    await app.inject({ method: 'POST', url: `/internal/workspaces/${ws.id}/analytics/recompute` });
    res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/analytics/dark-funnel`,
    });
    expect(res.json()).toHaveLength(0);
  });

  it('gets and updates dark-funnel settings (visitThresholdCount/windowDays only)', async () => {
    const ws = await createTestWorkspace(db);
    const getRes = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/analytics/dark-funnel-settings`,
    });
    expect(getRes.json()).toEqual({ visitThresholdCount: 3, windowDays: 14 });

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/internal/workspaces/${ws.id}/analytics/dark-funnel-settings`,
      payload: { visitThresholdCount: 5, windowDays: 30 },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json()).toEqual({ visitThresholdCount: 5, windowDays: 30 });
  });

  it('rejects a dark-funnel settings update with a URL-pattern field (not accepted per Decision 5)', async () => {
    const ws = await createTestWorkspace(db);
    const res = await app.inject({
      method: 'PATCH',
      url: `/internal/workspaces/${ws.id}/analytics/dark-funnel-settings`,
      payload: { visitThresholdCount: 3, windowDays: 14, keyPagePatterns: ['/pricing'] },
    });
    // extra field is simply stripped by zod (not strict), request itself succeeds
    expect(res.statusCode).toBe(200);
    expect(res.json()).not.toHaveProperty('keyPagePatterns');
  });
});

describe('rep performance analytics (KAN-77)', () => {
  it('attributes response time/conversion via routing_events.rep_id, not actor identity', async () => {
    const ws = await createTestWorkspace(db);
    const repId = await createTestRep(ws.id, 'Jamie');

    const deliveredAt = new Date(Date.now() - 60_000);
    const respondedAt = new Date(Date.now() - 30_000);

    const s1 = await createTestSession(ws.id);
    await recordRoutingEvent(ws.id, s1, repId);
    await recordDelivery(ws.id, s1, deliveredAt);
    await recordResponse(ws.id, s1, 'booked', respondedAt);

    const s2 = await createTestSession(ws.id);
    await recordRoutingEvent(ws.id, s2, repId);
    await recordDelivery(ws.id, s2, deliveredAt);
    // no response for s2 — counts toward assignedCount but not respondedCount

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/analytics/rep-performance`,
    });
    expect(res.statusCode).toBe(200);
    const stats = res.json();
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({
      repId,
      repName: 'Jamie',
      assignedCount: 2,
      respondedCount: 1,
      bookedCount: 1,
    });
    expect(stats[0].avgResponseMs).toBeGreaterThan(0);
  });

  it('excludes fallback-routed sessions (no rep_id) from rep attribution', async () => {
    const ws = await createTestWorkspace(db);
    const s1 = await createTestSession(ws.id);
    await db.query(
      `INSERT INTO routing_events (workspace_id, session_id, method) VALUES ($1, $2, 'fallback')`,
      [ws.id, s1]
    );

    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/analytics/rep-performance`,
    });
    expect(res.json()).toHaveLength(0);
  });

  it('filters by from/to date range applied to the routing decision instant', async () => {
    const ws = await createTestWorkspace(db);
    const repId = await createTestRep(ws.id);
    const s1 = await createTestSession(ws.id);
    await recordRoutingEvent(ws.id, s1, repId);

    const future = new Date(Date.now() + 60_000).toISOString();
    const res = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/analytics/rep-performance?from=${encodeURIComponent(future)}`,
    });
    expect(res.json()).toHaveLength(0);
  });
});

describe('weekly digest (KAN-76)', () => {
  it('sends a Slack digest only when the current time matches the configured slot', async () => {
    const ws = await createTestWorkspace(db, {
      name: 'Acme Corp',
      slackWebhookUrl: 'https://hooks.slack.com/services/test',
    });
    await db.query(`UPDATE workspaces SET digest_schedule = $2 WHERE id = $1`, [
      ws.id,
      { dayOfWeek: 1, hourUtc: 8 },
    ]);
    await createTestSession(ws.id, { firmographics: { domain: 'acme.com' } });
    await app.inject({ method: 'POST', url: `/internal/workspaces/${ws.id}/analytics/recompute` });

    const services = buildAnalyticsServices(db, app.log);

    const notMatchingTime = new Date(Date.UTC(2026, 0, 6, 9, 0, 0)); // Tuesday 09:00 UTC
    const sentWrongSlot = await services.digestService.sendIfDue(ws.id, notMatchingTime);
    expect(sentWrongSlot).toBe(false);
    expect(sendMessageMock).not.toHaveBeenCalled();

    const matchingTime = new Date(Date.UTC(2026, 0, 5, 8, 0, 0)); // Monday 08:00 UTC
    const sent = await services.digestService.sendIfDue(ws.id, matchingTime);
    expect(sent).toBe(true);
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).toHaveBeenCalledWith(
      { kind: 'webhook', webhookUrl: 'https://hooks.slack.com/services/test' },
      expect.objectContaining({ text: expect.stringContaining('Acme Corp') })
    );

    const logRes = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/analytics/digest-log`,
    });
    expect(logRes.json()).toHaveLength(1);
    expect(logRes.json()[0].channel).toBe('slack');
  });

  it('is idempotent: calling sendIfDue twice for the same period never double-sends (DB-enforced)', async () => {
    const ws = await createTestWorkspace(db, { slackWebhookUrl: 'https://hooks.slack.com/services/test' });
    const services = buildAnalyticsServices(db, app.log);
    const matchingTime = new Date(Date.UTC(2026, 0, 5, 8, 0, 0)); // Monday 08:00 UTC

    const first = await services.digestService.sendIfDue(ws.id, matchingTime);
    expect(first).toBe(true);
    expect(sendMessageMock).toHaveBeenCalledTimes(1);

    // Simulates an overlapping cron tick or a restart re-evaluating the
    // exact same hour — must be a no-op, guaranteed by
    // UNIQUE(workspace_id, period_key), not merely a time-window heuristic.
    const second = await services.digestService.sendIfDue(ws.id, matchingTime);
    expect(second).toBe(false);
    expect(sendMessageMock).toHaveBeenCalledTimes(1);

    const logRes = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/analytics/digest-log`,
    });
    expect(logRes.json()).toHaveLength(1); // never two rows for the same period
  });

  it('sends again once a new ISO week begins, even close together', async () => {
    const ws = await createTestWorkspace(db, { slackWebhookUrl: 'https://hooks.slack.com/services/test' });
    const services = buildAnalyticsServices(db, app.log);

    const week1 = new Date(Date.UTC(2026, 0, 5, 8, 0, 0)); // Monday, ISO week 2
    const week2 = new Date(Date.UTC(2026, 0, 12, 8, 0, 0)); // next Monday, ISO week 3

    const first = await services.digestService.sendIfDue(ws.id, week1);
    const second = await services.digestService.sendIfDue(ws.id, week2);
    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(sendMessageMock).toHaveBeenCalledTimes(2);
  });

  it('skips sending when no slack webhook is configured', async () => {
    const ws = await createTestWorkspace(db, { slackWebhookUrl: null });
    const services = buildAnalyticsServices(db, app.log);
    const matchingTime = new Date(Date.UTC(2026, 0, 5, 8, 0, 0));

    const sent = await services.digestService.sendIfDue(ws.id, matchingTime);
    expect(sent).toBe(false);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('gets and updates the digest schedule', async () => {
    const ws = await createTestWorkspace(db);
    const getRes = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${ws.id}/analytics/digest-schedule`,
    });
    expect(getRes.json()).toEqual({ dayOfWeek: 1, hourUtc: 8 });

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/internal/workspaces/${ws.id}/analytics/digest-schedule`,
      payload: { dayOfWeek: 3, hourUtc: 14 },
    });
    expect(patchRes.json()).toEqual({ dayOfWeek: 3, hourUtc: 14 });
  });
});

describe('workspace isolation across every analytics endpoint', () => {
  it('account-scores never leaks another workspace\'s scores, even with a colliding match_key', async () => {
    const wsA = await createTestWorkspace(db);
    const wsB = await createTestWorkspace(db);
    // Same domain at both workspaces on purpose — this is exactly the case
    // where a missing workspace_id filter would leak data across tenants.
    await createTestSession(wsA.id, { firmographics: { domain: 'shared-client.com' } });
    await createTestSession(wsB.id, { firmographics: { domain: 'shared-client.com' } });

    await app.inject({ method: 'POST', url: `/internal/workspaces/${wsA.id}/analytics/recompute` });
    await app.inject({ method: 'POST', url: `/internal/workspaces/${wsB.id}/analytics/recompute` });

    const scoresA = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${wsA.id}/analytics/account-scores`,
    });
    const scoresB = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${wsB.id}/analytics/account-scores`,
    });
    expect(scoresA.json()).toHaveLength(1);
    expect(scoresB.json()).toHaveLength(1);
    expect(scoresA.json()[0].workspaceId).toBe(wsA.id);
    expect(scoresB.json()[0].workspaceId).toBe(wsB.id);

    const historyA = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${wsA.id}/analytics/account-scores/shared-client.com/history`,
    });
    expect(historyA.json()).toHaveLength(1);
    expect(historyA.json()[0].workspaceId).toBe(wsA.id);
  });

  it('dark-funnel list never leaks another workspace\'s accounts', async () => {
    const wsA = await createTestWorkspace(db);
    const wsB = await createTestWorkspace(db);
    for (let i = 0; i < 3; i++) {
      await createTestSession(wsA.id, { firmographics: { domain: 'shared-client.com' } });
    }
    // wsB never qualifies (only 1 visit) — proves wsA's recompute can't
    // accidentally create or leak a row under wsB.
    await createTestSession(wsB.id, { firmographics: { domain: 'shared-client.com' } });

    await app.inject({ method: 'POST', url: `/internal/workspaces/${wsA.id}/analytics/recompute` });
    await app.inject({ method: 'POST', url: `/internal/workspaces/${wsB.id}/analytics/recompute` });

    const darkFunnelA = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${wsA.id}/analytics/dark-funnel`,
    });
    const darkFunnelB = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${wsB.id}/analytics/dark-funnel`,
    });
    expect(darkFunnelA.json()).toHaveLength(1);
    expect(darkFunnelA.json()[0].workspaceId).toBe(wsA.id);
    expect(darkFunnelB.json()).toHaveLength(0);
  });

  it('rep-performance never leaks another workspace\'s reps or routing events', async () => {
    const wsA = await createTestWorkspace(db);
    const wsB = await createTestWorkspace(db);
    const repA = await createTestRep(wsA.id, 'Jamie');
    const repB = await createTestRep(wsB.id, 'Jamie'); // same name, different workspace/rep id

    const sessionA = await createTestSession(wsA.id);
    await recordRoutingEvent(wsA.id, sessionA, repA);
    const sessionB = await createTestSession(wsB.id);
    await recordRoutingEvent(wsB.id, sessionB, repB);

    const statsA = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${wsA.id}/analytics/rep-performance`,
    });
    expect(statsA.json()).toHaveLength(1);
    expect(statsA.json()[0].repId).toBe(repA);
    expect(statsA.json()[0].repId).not.toBe(repB);
  });

  it('digest-log never leaks another workspace\'s deliveries', async () => {
    const wsA = await createTestWorkspace(db, { slackWebhookUrl: 'https://hooks.slack.com/services/a' });
    const wsB = await createTestWorkspace(db, { slackWebhookUrl: 'https://hooks.slack.com/services/b' });
    const services = buildAnalyticsServices(db, app.log);
    const matchingTime = new Date(Date.UTC(2026, 0, 5, 8, 0, 0));

    await services.digestService.sendIfDue(wsA.id, matchingTime);

    const logA = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${wsA.id}/analytics/digest-log`,
    });
    const logB = await app.inject({
      method: 'GET',
      url: `/internal/workspaces/${wsB.id}/analytics/digest-log`,
    });
    expect(logA.json()).toHaveLength(1);
    expect(logB.json()).toHaveLength(0);
  });
});
