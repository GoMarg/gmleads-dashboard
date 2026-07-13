import type { IDatabase, DigestDelivery, DigestChannel } from '@gmleads/shared';

interface DigestDeliveryRow {
  id: string;
  workspace_id: string;
  sent_at: Date;
  channel: DigestChannel;
  summary: Record<string, unknown>;
}

function toDigestDelivery(row: DigestDeliveryRow): DigestDelivery {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    sentAt: row.sent_at,
    channel: row.channel,
    summary: row.summary,
  };
}

export class DigestDeliveriesRepo {
  constructor(private db: IDatabase) {}

  async record(input: {
    workspaceId: string;
    channel: DigestChannel;
    summary: Record<string, unknown>;
  }): Promise<DigestDelivery> {
    const res = await this.db.query<DigestDeliveryRow>(
      `INSERT INTO digest_deliveries (workspace_id, channel, summary)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.workspaceId, input.channel, input.summary]
    );
    return toDigestDelivery(res.rows[0]);
  }

  async getLastSentAt(workspaceId: string): Promise<Date | null> {
    const res = await this.db.query<{ sent_at: Date }>(
      `SELECT sent_at FROM digest_deliveries
       WHERE workspace_id = $1
       ORDER BY sent_at DESC
       LIMIT 1`,
      [workspaceId]
    );
    return res.rows[0]?.sent_at ?? null;
  }

  async list(workspaceId: string): Promise<DigestDelivery[]> {
    const res = await this.db.query<DigestDeliveryRow>(
      `SELECT * FROM digest_deliveries WHERE workspace_id = $1 ORDER BY sent_at DESC`,
      [workspaceId]
    );
    return res.rows.map(toDigestDelivery);
  }
}
