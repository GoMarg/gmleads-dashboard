import { describe, it, expect, afterEach } from 'vitest';
import { buildApp } from '../../src/app.js';

describe('GET /health', () => {
  it('returns ok status', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', service: 'dashboard' });
    await app.close();
  });
});

// M5 task 5.3 (booking#7) — same defense-in-depth pattern applied to
// every backend service that has no auth of its own.
describe('internal auth (M5 task 5.3, booking#7)', () => {
  afterEach(() => {
    delete process.env.INTERNAL_SERVICE_SECRET;
  });

  it('/health stays reachable with no header even when the secret is configured', async () => {
    process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret';
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('rejects a direct request to a business route with no internal secret configured on the request', async () => {
    process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret';
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/internal/workspaces', payload: {} });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('allows a business route through once the correct internal secret header is present', async () => {
    process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret';
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/workspaces',
      headers: { 'x-internal-secret': 'test-internal-secret' },
      payload: {},
    });
    expect(res.statusCode).not.toBe(401);
    await app.close();
  });
});
