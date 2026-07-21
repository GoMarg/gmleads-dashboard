import type { IDatabase, AlertResponseAction, RepPerformanceStats } from '@gmleads/shared';

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

  // KAN-77 — Decision 4: attributed via routing_events.rep_id (who a lead
  // was ASSIGNED to), not via any actor-click identity — no such identity
  // is captured anywhere in the platform today (see ADR-016). This also
  // directly satisfies the AC's "account for round-robin volume
  // differences" — assignedCount is returned alongside the rate/avg
  // metrics precisely so the UI can show volume for context rather than
  // ranking by raw counts alone. Date range applies to the routing
  // decision instant (re.created_at), same convention as getResponseStats'
  // "alerts from last week" framing, just at the assignment level.
  async getRepPerformanceStats(
    workspaceId: string,
    from: Date | undefined,
    to: Date | undefined
  ): Promise<RepPerformanceStats[]> {
    const res = await this.db.query<RepPerformanceRow>(
      `WITH assigned AS (
         SELECT re.rep_id, re.session_id,
           (SELECT MIN(ad.created_at) FROM alert_deliveries ad
            WHERE ad.session_id = re.session_id AND ad.success = true) AS delivered_at
         FROM routing_events re
         WHERE re.workspace_id = $1 AND re.rep_id IS NOT NULL
           AND ($2::timestamptz IS NULL OR re.created_at >= $2)
           AND ($3::timestamptz IS NULL OR re.created_at <= $3)
       )
       SELECT
         r.id AS rep_id,
         r.name AS rep_name,
         COUNT(*) AS assigned_count,
         COUNT(*) FILTER (WHERE ar.created_at IS NOT NULL) AS responded_count,
         COUNT(*) FILTER (WHERE ar.action = 'booked') AS booked_count,
         AVG(EXTRACT(EPOCH FROM (ar.created_at - a.delivered_at)) * 1000)
           FILTER (WHERE a.delivered_at IS NOT NULL AND ar.created_at IS NOT NULL) AS avg_ms,
         PERCENTILE_CONT(0.5) WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (ar.created_at - a.delivered_at)) * 1000
         ) FILTER (WHERE a.delivered_at IS NOT NULL AND ar.created_at IS NOT NULL) AS median_ms
       FROM assigned a
       JOIN reps r ON r.id = a.rep_id
       LEFT JOIN alert_responses ar ON ar.session_id = a.session_id
       GROUP BY r.id, r.name
       ORDER BY assigned_count DESC`,
      [workspaceId, from ?? null, to ?? null]
    );
    return res.rows.map((row) => ({
      repId: row.rep_id,
      repName: row.rep_name,
      assignedCount: Number(row.assigned_count),
      respondedCount: Number(row.responded_count),
      bookedCount: Number(row.booked_count),
      avgResponseMs: row.avg_ms !== null ? Math.round(Number(row.avg_ms)) : null,
      medianResponseMs: row.median_ms !== null ? Math.round(Number(row.median_ms)) : null,
    }));
  }
}

interface RepPerformanceRow {
  rep_id: string;
  rep_name: string;
  assigned_count: string;
  responded_count: string;
  booked_count: string;
  avg_ms: string | null;
  median_ms: string | null;
}
