import type { FastifyBaseLogger } from 'fastify';
import { getNotification, type DigestSchedule } from '@gmleads/shared';
import { AccountScoresRepo } from '../db/account-scores.repo.js';
import { DarkFunnelRepo } from '../db/dark-funnel.repo.js';
import { DigestDeliveriesRepo } from '../db/digest-deliveries.repo.js';
import { WorkspaceRepo } from '../db/workspace.repo.js';
import { buildDigestBlocks } from './digest-blocks.js';

const DEFAULT_SCHEDULE: DigestSchedule = { dayOfWeek: 1, hourUtc: 8 };
// Guards against double-sending if the hourly check job fires twice for
// the same configured slot (e.g. a restart) — a real weekly digest is
// never less than a few days apart, so anything sent within the last 6
// days blocks a resend without needing exact-hour dedup logic.
const MIN_DAYS_BETWEEN_SENDS = 6;
const LOOKBACK_DAYS_FOR_NEW_DARK_FUNNEL = 7;

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
  async sendIfDue(workspaceId: string, now: Date): Promise<boolean> {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) return false;

    const schedule = workspace.digestSchedule ?? DEFAULT_SCHEDULE;
    if (now.getUTCDay() !== schedule.dayOfWeek || now.getUTCHours() !== schedule.hourUtc) {
      return false;
    }

    const lastSentAt = await this.deliveriesRepo.getLastSentAt(workspaceId);
    if (lastSentAt) {
      const daysSinceLastSend = (now.getTime() - lastSentAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastSend < MIN_DAYS_BETWEEN_SENDS) return false;
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

    const payload = buildDigestBlocks({
      workspaceName: workspace.name,
      workspaceId,
      dashboardAppUrl: this.dashboardAppUrl,
      topScores,
      newDarkFunnelAccounts,
    });

    await getNotification().sendAlert(workspace.slackWebhookUrl, payload);

    await this.deliveriesRepo.record({
      workspaceId,
      channel: 'slack',
      summary: {
        topScoreCount: topScores.length,
        newDarkFunnelCount: newDarkFunnelAccounts.length,
      },
    });

    this.log.info({ workspaceId }, 'weekly digest sent');
    return true;
  }
}
