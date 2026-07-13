import type { IDatabase, DarkFunnelAccount } from '@gmleads/shared';

interface DarkFunnelAccountRow {
  id: string;
  workspace_id: string;
  match_key: string;
  first_qualified_at: Date;
  last_activity_at: Date;
  visit_count: number;
}

function toDarkFunnelAccount(row: DarkFunnelAccountRow): DarkFunnelAccount {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    matchKey: row.match_key,
    firstQualifiedAt: row.first_qualified_at,
    lastActivityAt: row.last_activity_at,
    visitCount: row.visit_count,
  };
}

// KAN-75: dark_funnel_accounts holds current membership only, not history
// (see migration 008) — upserted on qualify, deleted on disqualify.
export class DarkFunnelRepo {
  constructor(private db: IDatabase) {}

  async list(workspaceId: string): Promise<DarkFunnelAccount[]> {
    const res = await this.db.query<DarkFunnelAccountRow>(
      `SELECT * FROM dark_funnel_accounts
       WHERE workspace_id = $1
       ORDER BY last_activity_at DESC`,
      [workspaceId]
    );
    return res.rows.map(toDarkFunnelAccount);
  }

  // KAN-76: "newly surfaced dark-funnel entries" for the weekly digest —
  // first_qualified_at is only ever set on the initial upsert (see below),
  // so this is genuinely "became dark-funnel-qualified since <since>", not
  // just "still qualified".
  async listQualifiedSince(workspaceId: string, since: Date): Promise<DarkFunnelAccount[]> {
    const res = await this.db.query<DarkFunnelAccountRow>(
      `SELECT * FROM dark_funnel_accounts
       WHERE workspace_id = $1 AND first_qualified_at >= $2
       ORDER BY first_qualified_at DESC`,
      [workspaceId, since]
    );
    return res.rows.map(toDarkFunnelAccount);
  }

  // first_qualified_at is only set on first insert (COALESCE keeps the
  // original on every subsequent upsert) — visit_count/last_activity_at
  // always reflect the latest recompute.
  async upsert(input: {
    workspaceId: string;
    matchKey: string;
    lastActivityAt: Date;
    visitCount: number;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO dark_funnel_accounts (workspace_id, match_key, last_activity_at, visit_count)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (workspace_id, match_key)
       DO UPDATE SET last_activity_at = $3, visit_count = $4`,
      [input.workspaceId, input.matchKey, input.lastActivityAt, input.visitCount]
    );
  }

  async remove(workspaceId: string, matchKey: string): Promise<void> {
    await this.db.query(
      `DELETE FROM dark_funnel_accounts WHERE workspace_id = $1 AND match_key = $2`,
      [workspaceId, matchKey]
    );
  }
}
