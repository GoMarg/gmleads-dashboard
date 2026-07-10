import type { IDatabase, AlertResponseAction } from '@gmleads/shared';

interface ResponseRow {
  action: AlertResponseAction;
  created_at: Date;
}

export interface ResponseStats {
  avgMs: number | null;
  medianMs: number | null;
  respondedCount: number;
  noResponseCount: number;
}

interface StatsRow {
  responded_count: string;
  no_response_count: string;
  avg_ms: string | null;
  median_ms: string | null;
}

export class AlertResponsesRepo {
  constructor(private db: IDatabase) {}

  // KAN-59: "first response wins" is enforced by alert_responses' own
  // UNIQUE(session_id) constraint — ON CONFLICT DO NOTHING, then read back
  // whichever action actually persisted (which may not be the one this
  // call requested, if a rep or the booking flow beat it).
  async respond(
    sessionId: string,
    workspaceId: string,
    action: 'claimed' | 'dismissed'
  ): Promise<{ action: AlertResponseAction; respondedAt: Date }> {
    await this.db.query(
      `INSERT INTO alert_responses (session_id, workspace_id, action)
       VALUES ($1, $2, $3)
       ON CONFLICT (session_id) DO NOTHING`,
      [sessionId, workspaceId, action]
    );
    const res = await this.db.query<ResponseRow>(
      'SELECT action, created_at FROM alert_responses WHERE session_id = $1',
      [sessionId]
    );
    const row = res.rows[0]!; // guaranteed to exist — the insert above created it if nothing else did
    return { action: row.action, respondedAt: row.created_at };
  }

  // KAN-59 AC2/AC3: avg/median response time (literal AC wording — not
  // p95, that's KAN-51's separate delivery-latency metric) plus counts
  // distinguishing responded vs. never-responded alerts, over an optional
  // date range applied to the delivery instant (not the response instant —
  // "alerts delivered in this range," matching how a rep would think about
  // "alerts from last week").
  async getResponseStats(
    workspaceId: string,
    from: Date | undefined,
    to: Date | undefined
  ): Promise<ResponseStats> {
    const res = await this.db.query<StatsRow>(
      `WITH delivered AS (
         SELECT s.id AS session_id,
           (SELECT MIN(ad.created_at) FROM alert_deliveries ad
            WHERE ad.session_id = s.id AND ad.success = true) AS delivered_at
         FROM sessions s
         WHERE s.workspace_id = $1
       )
       SELECT
         COUNT(*) FILTER (WHERE ar.created_at IS NOT NULL) AS responded_count,
         COUNT(*) FILTER (WHERE ar.created_at IS NULL) AS no_response_count,
         AVG(EXTRACT(EPOCH FROM (ar.created_at - d.delivered_at)) * 1000) AS avg_ms,
         PERCENTILE_CONT(0.5) WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (ar.created_at - d.delivered_at)) * 1000
         ) AS median_ms
       FROM delivered d
       LEFT JOIN alert_responses ar ON ar.session_id = d.session_id
       WHERE d.delivered_at IS NOT NULL
         AND ($2::timestamptz IS NULL OR d.delivered_at >= $2)
         AND ($3::timestamptz IS NULL OR d.delivered_at <= $3)`,
      [workspaceId, from ?? null, to ?? null]
    );
    const row = res.rows[0]!;
    return {
      avgMs: row.avg_ms !== null ? Math.round(Number(row.avg_ms)) : null,
      medianMs: row.median_ms !== null ? Math.round(Number(row.median_ms)) : null,
      respondedCount: Number(row.responded_count),
      noResponseCount: Number(row.no_response_count),
    };
  }
}
