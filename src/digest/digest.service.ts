import type { FastifyBaseLogger } from 'fastify';
import { getNotification, type DigestSchedule } from '@gmleads/shared';
import { AccountScoresRepo } from '../db/account-scores.repo.js';
import { DarkFunnelRepo } from '../db/dark-funnel.repo.js';
import { DigestDeliveriesRepo } from '../db/digest-deliveries.repo.js';
import { WorkspaceRepo } from '../db/workspace.repo.js';
import { buildDigestBlocks } from './digest-blocks.js';

const DEFAULT_SCHEDULE: DigestSchedule = { dayOfWeek: 1, hourUtc: 8 };
const LOOKBACK_DAYS_FOR_NEW_DARK_FUNNEL = 7;

// ISO-8601 week string, e.g. '2026-W03' — UTC-based, matching how the
// schedule's dayOfWeek/hourUtc are already evaluated in UTC. Pure and
// deterministic: the same instant always maps to the same period.
function getIsoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // ISO weeks start Monday; shift Sunday (0) to 7 so the "nearest Thursday"
  // trick below works for every day of the week.
  const isoDay = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + 4 - isoDay);
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const weekNumber = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${isoYear}-W${String(weekNumber).padStart(2, '0')}`;
}

export class DigestService {
  constructor(
    private scoresRepo: AccountScoresRepo,
    private darkFunnelRepo: DarkFunnelRepo,
    private deliveriesRepo: DigestDeliveriesRepo,
    private workspaceRepo: WorkspaceRepo,
    private dashboardAppUrl: string,
    private log: FastifyBaseLogger
  ) {}

  // Called hourly by the scheduled job for every workspace — a no-op
  // unless `now` falls in the workspace's configured day/hour slot.
  //
  // Idempotency: claimPeriod() is an atomic INSERT ... ON CONFLICT DO
  // NOTHING against UNIQUE(workspace_id, period_key) — called BEFORE the
  // Slack send, not after, so two overlapping invocations (an overlapping
  // cron tick, a restart mid-tick) can never both send. If claiming
  // succeeds but the Slack send itself then fails, the period stays
  // consumed rather than retried — deliberately favoring "never double-
  // post to a customer's Slack channel" over "always eventually
  // succeeds," consistent with this codebase's no-infinite-retry
  // philosophy (see ADR-015 Decision 3).
  async sendIfDue(workspaceId: string, now: Date): Promise<boolean> {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) return false;

    const schedule = workspace.digestSchedule ?? DEFAULT_SCHEDULE;
    if (now.getUTCDay() !== schedule.dayOfWeek || now.getUTCHours() !== schedule.hourUtc) {
      return false;
    }

    if (!workspace.slackWebhookUrl) {
      this.log.warn({ workspaceId }, 'digest due but no slack webhook configured — skipping');
      return false;
    }

    const [topScores, newDarkFunnelAccounts] = await Promise.all([
      this.scoresRepo.listCurrent(workspaceId),
      this.darkFunnelRepo.listQualifiedSince(
        workspaceId,
        new Date(now.getTime() - LOOKBACK_DAYS_FOR_NEW_DARK_FUNNEL * 24 * 60 * 60 * 1000)
      ),
    ]);

    const claimed = await this.deliveriesRepo.claimPeriod({
      workspaceId,
      periodKey: getIsoWeekKey(now),
      channel: 'slack',
      summary: {
        topScoreCount: topScores.length,
        newDarkFunnelCount: newDarkFunnelAccounts.length,
      },
    });
    if (!claimed) {
      this.log.info({ workspaceId }, 'digest period already claimed — skipping duplicate send');
      return false;
    }

    const payload = buildDigestBlocks({
      workspaceName: workspace.name,
      workspaceId,
      dashboardAppUrl: this.dashboardAppUrl,
      topScores,
      newDarkFunnelAccounts,
    });
    await getNotification().sendAlert(workspace.slackWebhookUrl, payload);

    this.log.info({ workspaceId }, 'weekly digest sent');
    return true;
  }
}
