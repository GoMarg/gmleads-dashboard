import type { IDatabase, AccountAssignment, AccountMatchType } from '@gmleads/shared';

interface AssignmentRow {
  id: string;
  workspace_id: string;
  match_type: AccountMatchType;
  match_key: string;
  rep_id: string;
  created_at: Date;
  updated_at: Date;
}

function toAssignment(row: AssignmentRow): AccountAssignment {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    matchType: row.match_type,
    matchKey: row.match_key,
    repId: row.rep_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// KAN-66: CSV-uploaded account-to-rep mapping.
export class AccountAssignmentsRepo {
  constructor(private db: IDatabase) {}

  // UNIQUE(workspace_id, match_key) makes this a true upsert — re-uploading
  // a CSV updates existing mappings (e.g. a re-assigned rep) rather than
  // duplicating them (KAN-66 AC).
  async upsert(
    workspaceId: string,
    matchType: AccountMatchType,
    matchKey: string,
    repId: string
  ): Promise<AccountAssignment> {
    const res = await this.db.query<AssignmentRow>(
      `INSERT INTO account_assignments (workspace_id, match_type, match_key, rep_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (workspace_id, match_key)
       DO UPDATE SET match_type = EXCLUDED.match_type, rep_id = EXCLUDED.rep_id, updated_at = NOW()
       RETURNING *`,
      [workspaceId, matchType, matchKey, repId]
    );
    return toAssignment(res.rows[0]);
  }

  async list(workspaceId: string): Promise<AccountAssignment[]> {
    const res = await this.db.query<AssignmentRow>(
      'SELECT * FROM account_assignments WHERE workspace_id = $1 ORDER BY created_at DESC',
      [workspaceId]
    );
    return res.rows.map(toAssignment);
  }
}
