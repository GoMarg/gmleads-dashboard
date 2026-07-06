import Fastify, { type FastifyInstance } from 'fastify';
import { registerErrorHandler } from '@gmleads/shared';
import { registerRoutes } from './routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  registerErrorHandler(app);

  app.get('/health', async () => {
    return { status: 'ok', service: 'dashboard' };
  });

  await registerRoutes(app);
  return app;
}
