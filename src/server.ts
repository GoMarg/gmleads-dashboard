import Fastify from 'fastify';

const app = Fastify({ logger: true });

app.get('/health', async () => {
  return { status: 'ok', service: 'dashboard' };
});

const port = Number(process.env.PORT ?? 3006);

app
  .listen({ port, host: '0.0.0.0' })
  .then(() => {
    app.log.info(`dashboard listening on ${port}`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });

export default app;
