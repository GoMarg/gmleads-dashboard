import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
const originalFlag = process.env.FEAT_RATE_LIMITING;

beforeAll(async () => {
  process.env.FEAT_RATE_LIMITING = 'true';
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
  if (originalFlag === undefined) delete process.env.FEAT_RATE_LIMITING;
  else process.env.FEAT_RATE_LIMITING = originalFlag;
});

describe('rate limiting', () => {
  it('returns 429 once a single caller exceeds the window limit, and lets a different caller through', async () => {
    const overLimitIp = '198.51.100.31';
    let sawTooManyRequests = false;
    for (let i = 0; i < 101; i++) {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { 'x-forwarded-for': overLimitIp },
      });
      if (res.statusCode === 429) {
        sawTooManyRequests = true;
        expect(res.json()).toEqual({ error: 'rate_limit_exceeded' });
        break;
      }
    }
    expect(sawTooManyRequests).toBe(true);

    const otherCaller = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-forwarded-for': '198.51.100.32' },
    });
    expect(otherCaller.statusCode).toBe(200);
  });

  it('does not rate limit when FEAT_RATE_LIMITING is off', async () => {
    process.env.FEAT_RATE_LIMITING = 'false';
    const offApp = await buildApp();
    try {
      const heavyCaller = '198.51.100.33';
      for (let i = 0; i < 105; i++) {
        const res = await offApp.inject({
          method: 'GET',
          url: '/health',
          headers: { 'x-forwarded-for': heavyCaller },
        });
        expect(res.statusCode).toBe(200);
      }
    } finally {
      await offApp.close();
      process.env.FEAT_RATE_LIMITING = 'true';
    }
  });
});
