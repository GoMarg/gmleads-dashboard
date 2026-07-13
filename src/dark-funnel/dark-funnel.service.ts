import type { FastifyBaseLogger } from 'fastify';
import type { DarkFunnelSettings } from '@gmleads/shared';
import { AccountSignalsRepo } from '../db/account-signals.repo.js';
import { DarkFunnelRepo } from '../db/dark-funnel.repo.js';
import { WorkspaceRepo } from '../db/workspace.repo.js';

const DEFAULT_SETTINGS: DarkFunnelSettings = { visitThresholdCount: 3, windowDays: 14 };

export class DarkFunnelService {
  constructor(
    private signalsRepo: AccountSignalsRepo,
    private darkFunnelRepo: DarkFunnelRepo,
    private workspaceRepo: WorkspaceRepo,
    private log: FastifyBaseLogger
  ) {}

  // KAN-75: "no chat" and "visit count" are both evaluated over the same
  // tenant-configured windowDays — an account that chatted long ago but has
  // gone quiet and started re-browsing without chatting for windowDays is
  // treated as newly dark-funnel-interesting again. Deliberately simple:
  // one window, not a separate "ever chatted" lifetime check.
  async recomputeWorkspace(workspaceId: string): Promise<number> {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    const settings = workspace?.darkFunnelSettings ?? DEFAULT_SETTINGS;

    const accounts = await this.signalsRepo.getAccountSignals(workspaceId, settings.windowDays);

    let qualifiedCount = 0;
    for (const account of accounts) {
      const qualifies = !account.hasEverChatted && account.visitCount >= settings.visitThresholdCount;

      if (qualifies) {
        await this.darkFunnelRepo.upsert({
          workspaceId,
          matchKey: account.matchKey,
          lastActivityAt: account.lastActivityAt,
          visitCount: account.visitCount,
        });
        qualifiedCount += 1;
      } else {
        await this.darkFunnelRepo.remove(workspaceId, account.matchKey);
      }
    }

    this.log.info({ workspaceId, qualifiedCount }, 'dark funnel recomputed');
    return qualifiedCount;
  }
}
