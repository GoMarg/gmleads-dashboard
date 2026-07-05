import Fastify from 'fastify';
import { registerErrorHandler } from '@gmleads/shared';
import { registerRoutes } from './routes.js';

const app = Fastify({ logger: true });
registerErrorHandler(app);

app.get('/health', async () => {
  return { status: 'ok', service: 'dashboard' };
});

const port = Number(process.env.PORT ?? 3006);

process.on('unhandledRejection', (err) => {
  app.log.error({ err }, 'unhandled rejection — service continues running');
});

async function start(): Promise<void> {
  await registerRoutes(app);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`dashboard listening on ${port}`);
}

start().catch((err) => {
  app.log.error(err);
  process.exit(1);
});

export default app;
