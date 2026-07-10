import type { IDatabase } from '@gmleads/shared';

// KAN-58: funnel (visitor→qualified→booked) and alert-delivery-health
// (p50/p95 latency, success/failure rate) aggregate stats. Kept in one repo
// file per explicit direction — both are small, read-only analytics
// queries over existing tables (sessions, alert_deliveries), not separate
// domains that warrant their own files.

export interface FunnelStats {
  visitorCount: number;
  qualifiedCount: number;
  bookedCount: number;
}

export interface DeliveryStats {
  p50Ms: number | null;
  p95Ms: number | null;
  successCount: number;
  failureCount: number;
}

interface FunnelRow {
  visitor_count: string;
  qualified_count: string;
  booked_count: string;
}

interface DeliveryRow {
  p50_ms: string | null;
  p95_ms: string | null;
  success_count: string;
  failure_count: string;
}

export class AnalyticsRepo {
  constructor(private db: IDatabase) {}

  // Visitor = every session row. Qualified = alerted_at IS NOT NULL — the
  // only place that column is ever written is gmleads-session's escalate
  // check (icpScore >= workspace threshold), so it's the same "qualified"
  // signal as the lead.qualified event's escalate flag, without needing a
  // second query against another service. Booked = sessions.status =
  // 'booked', set by the existing slot.booked handler. Date range applies
  // to session creation (visitor arrival), matching how a pilot customer
  // would think about "the funnel for last week."
  async getFunnelStats(
    workspaceId: string,
    from: Date | undefined,
    to: Date | undefined
  ): Promise<FunnelStats> {
    const res = await this.db.query<FunnelRow>(
      `SELECT
         COUNT(*) AS visitor_count,
         COUNT(*) FILTER (WHERE alerted_at IS NOT NULL) AS qualified_count,
         COUNT(*) FILTER (WHERE status = 'booked') AS booked_count
       FROM sessions
       WHERE workspace_id = $1
         AND ($2::timestamptz IS NULL OR created_at >= $2)
         AND ($3::timestamptz IS NULL OR created_at <= $3)`,
      [workspaceId, from ?? null, to ?? null]
    );
    const row = res.rows[0]!;
    return {
      visitorCount: Number(row.visitor_count),
      qualifiedCount: Number(row.qualified_count),
      bookedCount: Number(row.booked_count),
    };
  }

  // p50/p95 delivery latency + success/failure counts over alert_deliveries
  // (KAN-51/102, one row per send attempt). Date range applies to the
  // delivery attempt instant, same convention as alert-responses.repo.ts's
  // getResponseStats.
  //
  // Percentiles are computed only over successful attempts (FILTER (WHERE
  // success) on the ordered-set aggregates) — a failed attempt's
  // latency_ms measures how long it took to time out or error, not how
  // fast an alert was actually delivered, so mixing it into "delivery
  // latency" would inflate the percentile with numbers that don't
  // represent a delivery at all. Success/failure counts still cover every
  // attempt, unfiltered.
  async getDeliveryStats(
    workspaceId: string,
    from: Date | undefined,
    to: Date | undefined
  ): Promise<DeliveryStats> {
    const res = await this.db.query<DeliveryRow>(
      `SELECT
         PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE success) AS p50_ms,
         PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE success) AS p95_ms,
         COUNT(*) FILTER (WHERE success) AS success_count,
         COUNT(*) FILTER (WHERE NOT success) AS failure_count
       FROM alert_deliveries
       WHERE workspace_id = $1
         AND ($2::timestamptz IS NULL OR created_at >= $2)
         AND ($3::timestamptz IS NULL OR created_at <= $3)`,
      [workspaceId, from ?? null, to ?? null]
    );
    const row = res.rows[0]!;
    return {
      p50Ms: row.p50_ms !== null ? Math.round(Number(row.p50_ms)) : null,
      p95Ms: row.p95_ms !== null ? Math.round(Number(row.p95_ms)) : null,
      successCount: Number(row.success_count),
      failureCount: Number(row.failure_count),
    };
  }
}
