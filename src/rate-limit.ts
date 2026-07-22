import type { FastifyRequest, FastifyReply } from 'fastify';
import Redis from 'ioredis';
import { isEnabled } from '@gmleads/shared';

const WINDOW_SECONDS = 60;
const MAX_REQUESTS_PER_WINDOW = 100;

const redis = new Redis(process.env.REDIS_URL!, {
  retryStrategy: (attempt: number): number => Math.min(attempt * 100, 2000),
  maxRetriesPerRequest: 3,
});
redis.on('error', (err) => {
  console.error('[rate-limit] redis connection error:', err.message);
});

// This service has no public Railway domain — every request originates
// from gmleads-gateway's proxy (already rate-limited at the real external
// edge) or another internal service over Railway's private network. This
// is defense-in-depth against a misbehaving/compromised internal caller,
// not the primary external abuse defense. Fixed-window rate limit per
// caller IP. No-op unless FEAT_RATE_LIMITING is on (local: off, staging/prod: on).
export async function rateLimit(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!isEnabled('FEAT_RATE_LIMITING')) return;

  const forwardedFor = req.headers['x-forwarded-for'] as string | undefined;
  const ip = forwardedFor ? forwardedFor.split(',')[0]!.trim() : req.ip;
  // All 7 services share one Redis instance — without a per-service prefix,
  // two services that happen to see the same caller identity (e.g. every
  // service sees "127.0.0.1" for its own loopback health check) collide on
  // the same counter and cross-contaminate each other's limits.
  const key = `ratelimit:dashboard:${ip}:${Math.floor(Date.now() / (WINDOW_SECONDS * 1000))}`;

  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, WINDOW_SECONDS);
    }
    if (count > MAX_REQUESTS_PER_WINDOW) {
      return reply.code(429).send({ error: 'rate_limit_exceeded' });
    }
  } catch (err) {
    // Fail open: a Redis outage should not take the whole service down.
    // Rate limiting is a protective feature, not core functionality.
    req.log.error({ err }, 'rate limit check failed — allowing request through');
  }
}
