// KAN-74/76 — Decision 2: scheduling is encapsulated behind this interface
// so a future external trigger (Railway cron, a GitHub Actions scheduled
// workflow calling an internal endpoint, etc.) can replace CronScheduler
// without any analytics logic changing — only server.ts's wiring changes.

export interface ScheduledJob {
  name: string;
  // Standard 5-field cron expression, minute-resolution, always UTC.
  cronExpression: string;
  run: () => Promise<void>;
}

export interface Scheduler {
  schedule(job: ScheduledJob): void;
  start(): void;
  stop(): void;
}
