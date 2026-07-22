import { createRateLimiter } from '@gmleads/shared';

// This service has no public Railway domain — every request originates
// from gmleads-gateway's proxy (already rate-limited at the real external
// edge) or another internal service over Railway's private network. This
// is defense-in-depth against a misbehaving/compromised internal caller,
// not the primary external abuse defense. No-op unless FEAT_RATE_LIMITING
// is on (local: off, staging/prod: on). Implementation shared across
// every rate-limiting service (M4 task 4.4) — see
// gmleads-shared/src/http/rate-limit.ts.
const limiter = createRateLimiter('dashboard', process.env.REDIS_URL!);

export const rateLimit = limiter.check;
export const disconnectRateLimiter = limiter.disconnect;
