import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { registerErrorHandler, getDb } from '@gmleads/shared';
import { registerRoutes } from './routes.js';
import { rateLimit } from './rate-limit.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      redact: [
        'req.headers.authorization',
        'req.body.slackWebhookUrl',
        'req.body.adminPassword',
        'req.body.password',
        'req.body.refreshToken',
      ],
    },
  });
  registerErrorHandler(app);
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
