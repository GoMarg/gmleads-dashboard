import type { IDatabase } from '@gmleads/shared';

// KAN-60 — usage vs quota for the current calendar month (UTC).
// AI-message usage is deliberately not tracked: the product has no AI
// chat/LLM conversation feature (FEAT_AI_CONVERSATION has no real call site
// anywhere in the codebase) — see M8_DESIGN.md and decisions.md's KAN-60
// entries for the full reasoning. Enrichment-lookup usage is real and
// tracked here (see gmleads-session's enrichment_lookup_performed flag).
export interface UsageSummary {
  periodStart: Date;
  periodEnd: Date;
  sessionsUsed: number;
  sessionsQuota: number;
  enrichmentLookupsUsed: number;
  enrichmentLookupsQuota: number;
}

interface UsageRow {
  sessions_used: string;
  enrichment_lookups_used: string;
}

export class UsageRepo {
  constructor(private db: IDatabase) {}

  // Period is always "now," computed server-side — not caller-supplied —
  // so a tenant can't be shown a usage number for an arbitrary window and
  // mistake it for their current-period standing.
  async getCurrentPeriodUsage(
    workspaceId: string,
    quotas: { sessionsQuota: number; enrichmentLookupsQuota: number }
  ): Promise<UsageSummary> {
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    const res = await this.db.query<UsageRow>(
      `SELECT
         COUNT(*) AS sessions_used,
         COUNT(*) FILTER (WHERE enrichment_lookup_performed) AS enrichment_lookups_used
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
      sessionsQuota: quotas.sessionsQuota,
      enrichmentLookupsUsed: Number(res.rows[0]!.enrichment_lookups_used),
      enrichmentLookupsQuota: quotas.enrichmentLookupsQuota,
    };
  }
}
