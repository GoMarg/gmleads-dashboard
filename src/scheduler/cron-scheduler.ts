import cron, { type ScheduledTask } from 'node-cron';
import type { FastifyBaseLogger } from 'fastify';
import type { Scheduler, ScheduledJob } from './scheduler.js';

// The only Scheduler implementation for this wave (Decision 2). A failing
// job run is logged and swallowed — one bad tick must never crash the
// dashboard process or take other scheduled jobs down with it.
export class CronScheduler implements Scheduler {
  private jobs: ScheduledJob[] = [];
  private tasks: ScheduledTask[] = [];

  constructor(private log: FastifyBaseLogger) {}

  schedule(job: ScheduledJob): void {
    this.jobs.push(job);
  }

  start(): void {
    for (const job of this.jobs) {
      const task = cron.schedule(job.cronExpression, () => {
        job.run().catch((err: unknown) => {
          this.log.error({ err, job: job.name }, 'scheduled job failed');
        });
      });
      this.tasks.push(task);
    }
  }

  stop(): void {
    for (const task of this.tasks) task.stop();
    this.tasks = [];
  }
}
