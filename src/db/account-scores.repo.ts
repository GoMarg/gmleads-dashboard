import type { IDatabase, AccountScore, ScoreFactors } from '@gmleads/shared';

interface AccountScoreRow {
  id: string;
  workspace_id: string;
  match_key: string;
  score: number;
  factors: ScoreFactors;
  algorithm_version: string;
  computed_at: Date;
}

function toAccountScore(row: AccountScoreRow): AccountScore {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    matchKey: row.match_key,
    score: row.score,
    factors: row.factors,
    algorithmVersion: row.algorithm_version,
    computedAt: row.computed_at,
  };
}

// KAN-74: account_scores is append-only (see migration 008) — "current" is
// the latest row per (workspace_id, match_key); "history" is every row.
export class AccountScoresRepo {
  constructor(private db: IDatabase) {}

  async record(input: {
    workspaceId: string;
    matchKey: string;
    score: number;
    factors: ScoreFactors;
    algorithmVersion: string;
  }): Promise<AccountScore> {
    const res = await this.db.query<AccountScoreRow>(
      `INSERT INTO account_scores (workspace_id, match_key, score, factors, algorithm_version)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.workspaceId, input.matchKey, input.score, input.factors, input.algorithmVersion]
    );
    return toAccountScore(res.rows[0]);
  }

  // Latest row per match_key — DISTINCT ON relies on the
  // (workspace_id, match_key, computed_at DESC) index from migration 008.
  async listCurrent(workspaceId: string): Promise<AccountScore[]> {
    const res = await this.db.query<AccountScoreRow>(
      `SELECT DISTINCT ON (match_key) *
       FROM account_scores
       WHERE workspace_id = $1
       ORDER BY match_key, computed_at DESC`,
      [workspaceId]
    );
    return res.rows
      .map(toAccountScore)
      .sort((a, b) => b.score - a.score);
  }

  async getHistory(workspaceId: string, matchKey: string): Promise<AccountScore[]> {
    const res = await this.db.query<AccountScoreRow>(
      `SELECT * FROM account_scores
       WHERE workspace_id = $1 AND match_key = $2
       ORDER BY computed_at ASC`,
      [workspaceId, matchKey]
    );
    return res.rows.map(toAccountScore);
  }
}
