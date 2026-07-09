import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { getDb, verifyAccessToken } from '@gmleads/shared';
import {
  resetDatabase,
  createTestWorkspace,
  createTestUser,
} from '@gmleads/shared/dist/testing/fixtures.js';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';

const db = getDb();
let app: FastifyInstance;

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

describe('POST /internal/auth/login', () => {
  it('returns an access + refresh token scoped to the user’s workspace', async () => {
    const ws = await createTestWorkspace(db);
    const user = await createTestUser(db, ws.id);

    const res = await app.inject({
      method: 'POST',
      url: '/internal/auth/login',
      payload: { email: user.email, password: user.password },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.workspaceId).toBe(ws.id);
    expect(typeof body.accessToken).toBe('string');
    expect(typeof body.refreshToken).toBe('string');

    const payload = verifyAccessToken(body.accessToken, process.env.DASHBOARD_JWT_SECRET!);
    expect(payload).toEqual({ sub: user.id, workspaceId: ws.id });
  });

  it('rejects a wrong password with 401', async () => {
    const ws = await createTestWorkspace(db);
    const user = await createTestUser(db, ws.id);

    const res = await app.inject({
      method: 'POST',
      url: '/internal/auth/login',
      payload: { email: user.email, password: 'wrong-password' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a non-existent email with 401 (same shape as wrong password)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/auth/login',
      payload: { email: 'nobody@example.com', password: 'whatever123' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'invalid_credentials' });
  });

  it('rejects a malformed request body with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/auth/login',
      payload: { email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /internal/auth/refresh', () => {
  it('rotates the refresh token and issues a new access token', async () => {
    const ws = await createTestWorkspace(db);
    const user = await createTestUser(db, ws.id);
    const loginRes = await app.inject({
      method: 'POST',
      url: '/internal/auth/login',
      payload: { email: user.email, password: user.password },
    });
    const { refreshToken: oldRefreshToken } = loginRes.json();

    const refreshRes = await app.inject({
      method: 'POST',
      url: '/internal/auth/refresh',
      payload: { refreshToken: oldRefreshToken },
    });
    expect(refreshRes.statusCode).toBe(200);
    const body = refreshRes.json();
    expect(body.workspaceId).toBe(ws.id);
    expect(body.refreshToken).not.toBe(oldRefreshToken);

    // The old token is now revoked — reusing it must fail.
    const reuseRes = await app.inject({
      method: 'POST',
      url: '/internal/auth/refresh',
      payload: { refreshToken: oldRefreshToken },
    });
    expect(reuseRes.statusCode).toBe(401);
  });

  it('rejects an unknown refresh token with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/auth/refresh',
      payload: { refreshToken: 'not-a-real-token' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /internal/auth/logout', () => {
  it('revokes the refresh token so it can no longer be used to refresh', async () => {
    const ws = await createTestWorkspace(db);
    const user = await createTestUser(db, ws.id);
    const loginRes = await app.inject({
      method: 'POST',
      url: '/internal/auth/login',
      payload: { email: user.email, password: user.password },
    });
    const { refreshToken } = loginRes.json();

    const logoutRes = await app.inject({
      method: 'POST',
      url: '/internal/auth/logout',
      payload: { refreshToken },
    });
    expect(logoutRes.statusCode).toBe(204);

    const refreshRes = await app.inject({
      method: 'POST',
      url: '/internal/auth/refresh',
      payload: { refreshToken },
    });
    expect(refreshRes.statusCode).toBe(401);
  });

  it('is idempotent — logging out an already-revoked/unknown token still returns 204', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/auth/logout',
      payload: { refreshToken: 'never-existed' },
    });
    expect(res.statusCode).toBe(204);
  });
});
