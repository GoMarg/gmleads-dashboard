import type { ScoreFactors } from '@gmleads/shared';

export interface AccountScoringInput {
  // Raw 0-45 firmographic-fit points from gmleads-shared's
  // scoreFirmographicFit — reused, not re-derived, so account-level and
  // session-level scoring never disagree about ICP fit.
  firmographicFitRaw: number;
  visitCount: number;
  totalChatTurns: number;
  highIntentPageVisits: number;
}

export interface AccountScoreResult {
  score: number;
  factors: ScoreFactors;
}

// KAN-74: swappable so a future scoring revision replaces the calculator,
// not the persistence layer (account_scores.algorithm_version tags which
// calculator produced a given row). Keep lightweight — no registry, no DI
// container, just an interface + one implementation.
export interface ScoreCalculator {
  readonly version: string;
  calculate(input: AccountScoringInput): AccountScoreResult;
}

function clamp0to100(value: number): number {
  return Math.min(Math.max(Math.round(value), 0), 100);
}

// v1 weights: firmographic fit weighted highest (35%) since it's the only
// factor grounded in a tenant-defined ICP rather than raw activity counts;
// the three behavioral factors split the remaining 65% roughly evenly,
// with intent signals weighted a bit lower (15%) since a single pricing-
// page view is a weaker signal than sustained visits or actual chat
// engagement. Documented here because these weights are a judgment call,
// not a derived formula — a future v2 should adjust them, not guess.
const WEIGHTS = {
  firmographicFit: 0.35,
  visitFrequency: 0.25,
  engagementDepth: 0.25,
  intentSignals: 0.15,
};

// firmographicFitRaw maxes out at 45 (25 industry + 20 size, see
// gmleads-shared's scoreFirmographicFit) — scaled to 0-100 here.
const FIRMOGRAPHIC_FIT_RAW_MAX = 45;

export class DefaultScoreCalculator implements ScoreCalculator {
  readonly version = 'v1';

  calculate(input: AccountScoringInput): AccountScoreResult {
    const firmographicFit = clamp0to100(
      (input.firmographicFitRaw / FIRMOGRAPHIC_FIT_RAW_MAX) * 100
    );
    // 5+ visits reaches the cap — a returning account is meaningfully
    // "frequent" well before double digits.
    const visitFrequency = clamp0to100((input.visitCount / 5) * 100);
    // 10+ turns reaches the cap.
    const engagementDepth = clamp0to100((input.totalChatTurns / 10) * 100);
    // 4+ high-intent page visits reaches the cap.
    const intentSignals = clamp0to100((input.highIntentPageVisits / 4) * 100);

    const factors: ScoreFactors = {
      firmographicFit,
      visitFrequency,
      engagementDepth,
      intentSignals,
    };

    const score = clamp0to100(
      factors.firmographicFit * WEIGHTS.firmographicFit +
        factors.visitFrequency * WEIGHTS.visitFrequency +
        factors.engagementDepth * WEIGHTS.engagementDepth +
        factors.intentSignals * WEIGHTS.intentSignals
    );

    return { score, factors };
  }
}
