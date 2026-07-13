import type { IDatabase } from '@gmleads/shared';
import type { FastifyBaseLogger } from 'fastify';
import { AccountSignalsRepo } from '../db/account-signals.repo.js';
import { AccountScoresRepo } from '../db/account-scores.repo.js';
import { DarkFunnelRepo } from '../db/dark-funnel.repo.js';
import { DigestDeliveriesRepo } from '../db/digest-deliveries.repo.js';
import { WorkspaceRepo } from '../db/workspace.repo.js';
import { DefaultScoreCalculator } from '../scoring/score-calculator.js';
import { AccountScoringService } from '../scoring/account-scoring.service.js';
import { DarkFunnelService } from '../dark-funnel/dark-funnel.service.js';
import { DigestService } from '../digest/digest.service.js';

export interface AnalyticsServices {
  accountSignalsRepo: AccountSignalsRepo;
  accountScoresRepo: AccountScoresRepo;
  darkFunnelRepo: DarkFunnelRepo;
  digestDeliveriesRepo: DigestDeliveriesRepo;
  workspaceRepo: WorkspaceRepo;
  accountScoringService: AccountScoringService;
  darkFunnelService: DarkFunnelService;
  digestService: DigestService;
}

// Single construction point so routes.ts (request-driven use) and
// server.ts (the scheduled-job wiring) never end up with two different
// instantiations of the same Wave 3 services drifting apart.
export function buildAnalyticsServices(
  db: IDatabase,
  log: FastifyBaseLogger
): AnalyticsServices {
  const accountSignalsRepo = new AccountSignalsRepo(db);
  const accountScoresRepo = new AccountScoresRepo(db);
  const darkFunnelRepo = new DarkFunnelRepo(db);
  const digestDeliveriesRepo = new DigestDeliveriesRepo(db);
  const workspaceRepo = new WorkspaceRepo(db);
  const dashboardAppUrl = process.env.DASHBOARD_APP_URL ?? 'http://localhost:13000';

  const accountScoringService = new AccountScoringService(
    accountSignalsRepo,
    accountScoresRepo,
    workspaceRepo,
    new DefaultScoreCalculator(),
    log
  );
  const darkFunnelService = new DarkFunnelService(
    accountSignalsRepo,
    darkFunnelRepo,
    workspaceRepo,
    log
  );
  const digestService = new DigestService(
    accountScoresRepo,
    darkFunnelRepo,
    digestDeliveriesRepo,
    workspaceRepo,
    dashboardAppUrl,
    log
  );

  return {
    accountSignalsRepo,
    accountScoresRepo,
    darkFunnelRepo,
    digestDeliveriesRepo,
    workspaceRepo,
    accountScoringService,
    darkFunnelService,
    digestService,
  };
}
