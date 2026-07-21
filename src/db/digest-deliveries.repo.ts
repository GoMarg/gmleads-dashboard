import type { IDatabase, DigestDelivery, DigestChannel } from '@gmleads/shared';

interface DigestDeliveryRow {
  id: string;
  workspace_id: string;
  period_key: string;
  sent_at: Date;
  channel: DigestChannel;
  summary: Record<string, unknown>;
}

function toDigestDelivery(row: DigestDeliveryRow): DigestDelivery {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    periodKey: row.period_key,
    sentAt: row.sent_at,
    channel: row.channel,
    summary: row.summary,
  };
}

export class DigestDeliveriesRepo {
  constructor(private db: IDatabase) {}

  // Atomically claims (workspace_id, period_key) — returns the inserted
  // row, or null if that period was already claimed (by an overlapping
  // cron tick, a restart mid-tick, etc.). This INSERT ... ON CONFLICT DO
  // NOTHING is the actual idempotency guarantee — DigestService must call
  // this BEFORE sending to Slack, not after, so two concurrent callers can
  // never both believe they're the one that gets to send.
  async claimPeriod(input: {
    workspaceId: string;
    periodKey: string;
    channel: DigestChannel;
    summary: Record<string, unknown>;
  }): Promise<DigestDelivery | null> {
    const res = await this.db.query<DigestDeliveryRow>(
      `INSERT INTO digest_deliveries (workspace_id, period_key, channel, summary)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (workspace_id, period_key) DO NOTHING
       RETURNING *`,
      [input.workspaceId, input.periodKey, input.channel, input.summary]
    );
    return res.rows[0] ? toDigestDelivery(res.rows[0]) : null;
  }

  async list(workspaceId: string): Promise<DigestDelivery[]> {
    const res = await this.db.query<DigestDeliveryRow>(
      `SELECT * FROM digest_deliveries WHERE workspace_id = $1 ORDER BY sent_at DESC`,
      [workspaceId]
    );
    return res.rows.map(toDigestDelivery);
  }
}
