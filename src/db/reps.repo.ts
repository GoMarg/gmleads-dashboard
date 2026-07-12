import type { IDatabase, Rep } from '@gmleads/shared';

interface RepRow {
  id: string;
  workspace_id: string;
  name: string;
  email: string;
  slack_member_id: string | null;
  active: boolean;
  created_at: Date;
}

function toRep(row: RepRow): Rep {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    email: row.email,
    slackMemberId: row.slack_member_id,
    active: row.active,
    createdAt: row.created_at,
  };
}

// KAN-66: admin management of the reps a tenant can assign accounts to.
// Deliberately separate from UsersRepo (dashboard login accounts) — see
// decisions.md.
export class RepsRepo {
  constructor(private db: IDatabase) {}

  async create(
    workspaceId: string,
    input: { name: string; email: string; slackMemberId: string | null }
  ): Promise<Rep> {
    const res = await this.db.query<RepRow>(
      `INSERT INTO reps (workspace_id, name, email, slack_member_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [workspaceId, input.name, input.email, input.slackMemberId]
    );
    return toRep(res.rows[0]);
  }

  async list(workspaceId: string): Promise<Rep[]> {
    const res = await this.db.query<RepRow>(
      'SELECT * FROM reps WHERE workspace_id = $1 ORDER BY created_at ASC',
      [workspaceId]
    );
    return res.rows.map(toRep);
  }

  async findByEmail(workspaceId: string, email: string): Promise<Rep | null> {
    const res = await this.db.query<RepRow>(
      'SELECT * FROM reps WHERE workspace_id = $1 AND email = $2',
      [workspaceId, email]
    );
    return res.rows[0] ? toRep(res.rows[0]) : null;
  }

  // Soft-delete only — a hard delete would cascade and destroy the
  // historical account_assignments/routing_events audit trail (KAN-69).
  async update(
    workspaceId: string,
    repId: string,
    input: { name?: string; slackMemberId?: string | null; active?: boolean }
  ): Promise<Rep | null> {
    const res = await this.db.query<RepRow>(
      `UPDATE reps SET
         name = COALESCE($3, name),
         slack_member_id = CASE WHEN $4::boolean THEN $5 ELSE slack_member_id END,
         active = COALESCE($6, active)
       WHERE workspace_id = $1 AND id = $2
       RETURNING *`,
      [
        workspaceId,
        repId,
        input.name ?? null,
        input.slackMemberId !== undefined,
        input.slackMemberId ?? null,
        input.active ?? null,
      ]
    );
    return res.rows[0] ? toRep(res.rows[0]) : null;
  }
}
