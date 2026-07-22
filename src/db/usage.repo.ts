import type { IDatabase } from '@gmleads/shared';

// KAN-60 — sessions used vs quota for the current calendar month (UTC).
// Scope deliberately limited to session count: the Jira story's other two
// usage dimensions (AI messages, enrichment lookups) and internal
// approaching-quota alerting are not implemented in this pass — see
// decisions.md's KAN-60 entry for why.
export interface UsageSummary {
  periodStart: Date;
  periodEnd: Date;
  sessionsUsed: number;
  sessionsQuota: number;
}

interface UsageRow {
  sessions_used: string;
}

export class UsageRepo {
  constructor(private db: IDatabase) {}

  // Period is always "now," computed server-side — not caller-supplied —
  // so a tenant can't be shown a usage number for an arbitrary window and
  // mistake it for their current-period standing.
  async getCurrentPeriodUsage(workspaceId: string, sessionsQuota: number): Promise<UsageSummary> {
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    const res = await this.db.query<UsageRow>(
      `SELECT COUNT(*) AS sessions_used
       FROM sessions
       WHERE workspace_id = $1
         AND created_at >= $2
         AND created_at < $3`,
      [workspaceId, periodStart, periodEnd]
    );

    return {
      periodStart,
      periodEnd,
      sessionsUsed: Number(res.rows[0]!.sessions_used),
      sessionsQuota,
    };
  }
}
