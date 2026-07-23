import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { registerErrorHandler, getDb, internalAuth } from '@gmleads/shared';
import { registerRoutes } from './routes.js';
import { rateLimit } from './rate-limit.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    // Reuse gateway's correlation ID (forwarded as x-request-id) so one
    // request traces across every service's logs under the same reqId;
    // fall back to a fresh UUID for calls that don't go through gateway.
    genReqId: (req) => (req.headers['x-request-id'] as string) || randomUUID(),
    logger: {
      base: { service: 'dashboard', environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? 'development' },
      redact: [
        'req.headers.authorization',
        'req.body.slackWebhookUrl',
        'req.body.adminPassword',
        'req.body.password',
        'req.body.refreshToken',
      ],
      ...(process.env.LOGTAIL_SOURCE_TOKEN
        ? {
            transport: {
              target: '@logtail/pino',
              options: {
                sourceToken: process.env.LOGTAIL_SOURCE_TOKEN,
                options: { endpoint: `https://${process.env.LOGTAIL_INGESTING_HOST}` },
              },
            },
          }
        : {}),
    },
  });
  registerErrorHandler(app);
  // M5 task 5.3 (booking#7) — defense-in-depth: rejects a request that
  // didn't come through gateway's proxy, once INTERNAL_SERVICE_SECRET is
  // configured. Runs before rate limiting — an unauthorized request
  // shouldn't consume rate-limit budget.
  app.addHook('preHandler', internalAuth);
  app.addHook('preHandler', rateLimit);
  // KAN-66: CSV account-list upload. 1MB cap is generous for a CSV of
  // account/rep-email rows — large enough for real tenant usage, small
  // enough to rule out an accidental/abusive huge upload.
  await app.register(multipart, { limits: { fileSize: 1024 * 1024 } });

  app.get('/health', async () => {
    return { status: 'ok', service: 'dashboard' };
  });

  // Liveness (/health) never checks dependencies — a DB blip must not look
  // like a crash to Railway's restart policy. This one is for external
  // monitoring/load-balancer readiness decisions instead.
  app.get('/health/ready', async (_req, reply) => {
    try {
      await getDb().query('SELECT 1');
      return { status: 'ok', service: 'dashboard', checks: { db: 'ok' } };
    } catch (err) {
      app.log.error({ err }, 'readiness check failed');
      return reply
        .code(503)
        .send({ status: 'error', service: 'dashboard', checks: { db: 'error' } });
    }
  });

  await registerRoutes(app);
  return app;
}
