import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { registerErrorHandler } from '@gmleads/shared';
import { registerRoutes } from './routes.js';

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
  // KAN-66: CSV account-list upload. 1MB cap is generous for a CSV of
  // account/rep-email rows — large enough for real tenant usage, small
  // enough to rule out an accidental/abusive huge upload.
  await app.register(multipart, { limits: { fileSize: 1024 * 1024 } });

  app.get('/health', async () => {
    return { status: 'ok', service: 'dashboard' };
  });

  await registerRoutes(app);
  return app;
}
