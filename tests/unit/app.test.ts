import { describe, it, expect } from 'vitest';
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
