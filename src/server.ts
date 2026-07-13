import { getDb } from '@gmleads/shared';
import { buildApp } from './app.js';
import { CronScheduler } from './scheduler/cron-scheduler.js';
import { buildAnalyticsServices } from './analytics/build-analytics-services.js';
import { WorkspaceRepo } from './db/workspace.repo.js';

const port = Number(process.env.PORT ?? 3006);

async function start(): Promise<void> {
  const app = await buildApp();

  process.on('unhandledRejection', (err) => {
    app.log.error({ err }, 'unhandled rejection — service continues running');
  });

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

    const scheduler = new CronScheduler(app.log);
    scheduler.schedule({
      name: 'nightly-account-scoring',
      cronExpression: '0 2 * * *', // 02:00 UTC daily
      run: async () => {
        const workspaces = await workspaceRepo.findAll();
        for (const workspace of workspaces) {
          await accountScoringService.recomputeWorkspace(workspace.id);
          await darkFunnelService.recomputeWorkspace(workspace.id);
        }
      },
    });
    scheduler.schedule({
      name: 'hourly-digest-schedule-check',
      cronExpression: '0 * * * *', // every hour, on the hour, UTC
      run: async () => {
        const workspaces = await workspaceRepo.findAll();
        const now = new Date();
        for (const workspace of workspaces) {
          await digestService.sendIfDue(workspace.id, now);
        }
      },
    });
    scheduler.start();
    app.log.info('analytics scheduler enabled (ENABLE_ANALYTICS_SCHEDULER=true)');
  } else {
    app.log.info('analytics scheduler disabled (set ENABLE_ANALYTICS_SCHEDULER=true to enable)');
  }

  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`dashboard listening on ${port}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
