import type { FastifyBaseLogger } from 'fastify';
import { scoreFirmographicFit, type IcpDefinition } from '@gmleads/shared';
import { AccountSignalsRepo } from '../db/account-signals.repo.js';
import { AccountScoresRepo } from '../db/account-scores.repo.js';
import { WorkspaceRepo } from '../db/workspace.repo.js';
import type { ScoreCalculator } from './score-calculator.js';

// Lookback window for what counts as "activity" for scoring purposes —
// deliberately generous (vs. dark funnel's much shorter, tenant-configured
// window) since a score should reflect an account's overall engagement
// history, not just recent weeks.
const SCORING_LOOKBACK_DAYS = 90;

const DEFAULT_ICP: IcpDefinition = {
  industries: [],
  sizes: [],
  keywords: [],
  scoreThreshold: 70,
};

export class AccountScoringService {
  constructor(
    private signalsRepo: AccountSignalsRepo,
    private scoresRepo: AccountScoresRepo,
    private workspaceRepo: WorkspaceRepo,
    private calculator: ScoreCalculator,
    private log: FastifyBaseLogger
  ) {}

  // KAN-74: recomputes every account's score for one workspace. Called by
  // the nightly scheduled job and by the manual recompute route.
  async recomputeWorkspace(workspaceId: string): Promise<number> {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    const icp = workspace?.icpDefinition ?? DEFAULT_ICP;

    const accounts = await this.signalsRepo.getAccountSignals(workspaceId, SCORING_LOOKBACK_DAYS);

    for (const account of accounts) {
      const firmographicFitRaw = scoreFirmographicFit(account.firmographics, icp);
      const { score, factors } = this.calculator.calculate({
        firmographicFitRaw,
        visitCount: account.visitCount,
        totalChatTurns: account.totalChatTurns,
        highIntentPageVisits: account.highIntentPageVisits,
      });

      await this.scoresRepo.record({
        workspaceId,
        matchKey: account.matchKey,
        score,
        factors,
        algorithmVersion: this.calculator.version,
      });
    }

    this.log.info(
      { workspaceId, accountCount: accounts.length },
      'account scores recomputed'
    );
    return accounts.length;
  }
}
