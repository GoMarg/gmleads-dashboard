import * as Sentry from '@sentry/node';
import { getDb } from '@gmleads/shared';
import { buildApp } from './app.js';
import { CronScheduler } from './scheduler/cron-scheduler.js';
import { buildAnalyticsServices } from './analytics/build-analytics-services.js';
import { WorkspaceRepo } from './db/workspace.repo.js';
import { disconnectRateLimiter } from './rate-limit.js';

// Error tracking (Better Stack, Sentry-SDK-compatible — M3 task 3.4). Only
// active when configured, so local/CI runs never report noise. 5xx route
// errors are captured in registerErrorHandler (gmleads-shared); this covers
// the one error class that doesn't go through Fastify's error handler at all.
if (process.env.ERROR_TRACKING_DSN) {
  Sentry.init({
    dsn: process.env.ERROR_TRACKING_DSN,
    environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? 'development',
  });
  Sentry.setTag('service', 'dashboard');
}

const port = Number(process.env.PORT ?? 3006);

async function start(): Promise<void> {
  const app = await buildApp();

  process.on('unhandledRejection', (err) => {
    app.log.error({ err }, 'unhandled rejection — service continues running');
    Sentry.captureException(err);
  });

  let analyticsScheduler: CronScheduler | null = null;

  // KAN-74/75/76 — real cron scheduling only runs in the actual server
  // process, never under buildApp()/tests, so vitest never has to manage
  // background timers. See Decision 2 — this is the only place node-cron
  // is referenced; analytics logic itself has no knowledge of it.
  //
  // Off by default — must be explicitly enabled via
  // ENABLE_ANALYTICS_SCHEDULER=true. This keeps local development and any
  // environment that doesn't set it (including a plain `docker compose up`)
  // from silently running nightly/hourly jobs against real data. Real
  // deployments (once KAN-31 lands) opt in explicitly.
  if (process.env.ENABLE_ANALYTICS_SCHEDULER === 'true') {
    const db = getDb();
    const workspaceRepo = new WorkspaceRepo(db);
    const { accountScoringService, darkFunnelService, digestService } = buildAnalyticsServices(
      db,
      app.log
    );

    analyticsScheduler = new CronScheduler(app.log);
    analyticsScheduler.schedule({
      name: 'nightly-account-scoring',
      cronExpression: '0 2 * * *', // 02:00 UTC daily
      run: async () => {
        for await (const batch of workspaceRepo.iterateAll()) {
          for (const workspace of batch) {
            await accountScoringService.recomputeWorkspace(workspace.id);
            await darkFunnelService.recomputeWorkspace(workspace.id);
          }
        }
      },
    });
    analyticsScheduler.schedule({
      name: 'hourly-digest-schedule-check',
      cronExpression: '0 * * * *', // every hour, on the hour, UTC
      run: async () => {
        const now = new Date();
        for await (const batch of workspaceRepo.iterateAll()) {
          for (const workspace of batch) {
            await digestService.sendIfDue(workspace.id, now);
          }
        }
      },
    });
    analyticsScheduler.start();
    app.log.info('analytics scheduler enabled (ENABLE_ANALYTICS_SCHEDULER=true)');
  } else {
    app.log.info('analytics scheduler disabled (set ENABLE_ANALYTICS_SCHEDULER=true to enable)');
  }

  // Railway sends SIGTERM on every deploy — without this, in-flight
  // requests get hard-killed and, if the analytics scheduler is enabled,
  // its cron tasks keep the process alive instead of exiting cleanly.
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info(`${signal} received, shutting down gracefully`);
    try {
      analyticsScheduler?.stop();
      await app.close();
      await getDb().end();
      disconnectRateLimiter(); // M4 task 4.4 — previously leaked on shutdown
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`dashboard listening on ${port}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
