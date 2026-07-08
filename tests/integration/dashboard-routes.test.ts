import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { getDb } from '@gmleads/shared';
import { resetDatabase, createTestWorkspace } from '@gmleads/shared/dist/testing/fixtures.js';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';

const db = getDb();
let app: FastifyInstance;

async function createTestSession(
  workspaceId: string,
  overrides: { status?: string; icpScore?: number } = {}
): Promise<string> {
  const res = await db.query<{ id: string }>(
    `INSERT INTO sessions (workspace_id, visitor_ip_hash, page_url, status, icp_score)
     VALUES ($1, 'test-hash', 'https://example.com/', $2, $3)
     RETURNING id`,
    [workspaceId, overrides.status ?? 'active', overrides.icpScore ?? 0]
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

describe('POST /internal/workspaces', () => {
  it('creates a workspace with a generated embed key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/workspaces',
      payload: { name: 'Acme Corp' },
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
      payload: { name: 'Acme', icpDefinition: { scoreThreshold: 40 } },
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
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an invalid slackWebhookUrl', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/workspaces',
      payload: { name: 'Acme', slackWebhookUrl: 'not-a-url' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('persists and returns slackChannelUrl when provided (KAN-97)', async () => {
    const channelUrl = 'https://join.slack.com/t/acme/shared_invite/abc123';
    const res = await app.inject({
      method: 'POST',
      url: '/internal/workspaces',
      payload: { name: 'Acme', slackChannelUrl: channelUrl },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().slackChannelUrl).toBe(channelUrl);
  });

  it('leaves slackChannelUrl null when omitted (backward-compat)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/workspaces',
      payload: { name: 'Acme' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().slackChannelUrl).toBeNull();
  });

  it('rejects a non-https slackChannelUrl', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/workspaces',
      payload: { name: 'Acme', slackChannelUrl: 'javascript:alert(1)' },
    });
    expect(res.statusCode).toBe(400);
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
});
