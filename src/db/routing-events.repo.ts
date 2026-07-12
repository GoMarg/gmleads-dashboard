import type { IDatabase, RoutingEvent } from '@gmleads/shared';

interface RoutingEventRow {
  id: string;
  workspace_id: string;
  session_id: string;
  method: RoutingEvent['method'];
  matched_key: string | null;
  rep_id: string | null;
  created_at: Date;
}

function toRoutingEvent(row: RoutingEventRow): RoutingEvent {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    sessionId: row.session_id,
    method: row.method,
    matchedKey: row.matched_key,
    repId: row.rep_id,
    createdAt: row.created_at,
  };
}

// KAN-69: read-only view over routing_events — the table itself was
// created in KAN-66's migration (KAN-67/68 write to it directly); this
// repo only exposes it, it does not own the write path.
export class RoutingEventsRepo {
  constructor(private db: IDatabase) {}

  async list(
    workspaceId: string,
    filters: { sessionId?: string; repId?: string; from?: Date; to?: Date } = {}
  ): Promise<RoutingEvent[]> {
    const conditions = ['workspace_id = $1'];
    const params: unknown[] = [workspaceId];

    if (filters.sessionId) {
      params.push(filters.sessionId);
      conditions.push(`session_id = $${params.length}`);
    }
    if (filters.repId) {
      params.push(filters.repId);
      conditions.push(`rep_id = $${params.length}`);
    }
    if (filters.from) {
      params.push(filters.from);
      conditions.push(`created_at >= $${params.length}`);
    }
    if (filters.to) {
      params.push(filters.to);
      conditions.push(`created_at <= $${params.length}`);
    }

    const res = await this.db.query<RoutingEventRow>(
      `SELECT * FROM routing_events WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT 200`,
      params
    );
    return res.rows.map(toRoutingEvent);
  }
}
