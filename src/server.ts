import { buildApp } from './app.js';

const port = Number(process.env.PORT ?? 3006);

async function start(): Promise<void> {
  const app = await buildApp();

  process.on('unhandledRejection', (err) => {
    app.log.error({ err }, 'unhandled rejection — service continues running');
  });

  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`dashboard listening on ${port}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
