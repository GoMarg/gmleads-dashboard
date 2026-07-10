import type { IDatabase, Session, SessionStatus, ConversationTurn, AlertResponseAction } from '@gmleads/shared';

// KAN-59: a Lead is a Session enriched with response-time data — never a
// separate query, always the same `sessions` row joined against
// alert_deliveries/alert_responses, so the leads list and session replay
// page always agree on whether/how fast a session was responded to.
export type Lead = Session & {
  responseAction: AlertResponseAction | null;
  responseTimeMs: number | null;
};

interface SessionRow {
  id: string;
  workspace_id: string;
  visitor_ip_hash: string;
  page_url: string;
  company_name: string | null;
  firmographics: Session['firmographics'];
  icp_score: number;
  status: SessionStatus;
  alerted_at: Date | null;
  pages_viewed: number;
  is_returning: boolean;
  created_at: Date;
  delivered_at: Date | null;
  response_action: AlertResponseAction | null;
  responded_at: Date | null;
}

interface TurnRow {
  id: string;
  session_id: string;
  role: 'visitor' | 'agent';
  content: string;
  icp_score_at_turn: number | null;
  intent_stage: ConversationTurn['intentStage'];
  created_at: Date;
}

// Every SELECT against `sessions` for dashboard display goes through this
// same join, so listLeads and getSessionWithTurns can never disagree about
// a session's response state.
const SESSION_WITH_RESPONSE_SELECT = `
  SELECT s.*,
    (SELECT MIN(ad.created_at) FROM alert_deliveries ad
     WHERE ad.session_id = s.id AND ad.success = true) AS delivered_at,
    ar.action AS response_action,
    ar.created_at AS responded_at
  FROM sessions s
  LEFT JOIN alert_responses ar ON ar.session_id = s.id
`;

function toLead(row: SessionRow): Lead {
  const responseTimeMs =
    row.delivered_at && row.responded_at
      ? row.responded_at.getTime() - row.delivered_at.getTime()
      : null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    visitorIpHash: row.visitor_ip_hash,
    pageUrl: row.page_url,
    companyName: row.company_name,
    firmographics: row.firmographics,
    icpScore: row.icp_score,
    status: row.status,
    alertedAt: row.alerted_at,
    pagesViewed: row.pages_viewed,
    isReturning: row.is_returning,
    createdAt: row.created_at,
    responseAction: row.response_action,
    responseTimeMs,
  };
}

function toTurn(row: TurnRow): ConversationTurn {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    icpScoreAtTurn: row.icp_score_at_turn,
    intentStage: row.intent_stage,
    createdAt: row.created_at,
  };
}

export interface LeadFilters {
  status?: SessionStatus;
  minScore?: number;
  limit?: number;
  offset?: number;
}

export class LeadsRepo {
  constructor(private db: IDatabase) {}

  async listLeads(workspaceId: string, filters: LeadFilters): Promise<Lead[]> {
    const conditions = ['s.workspace_id = $1'];
    const params: unknown[] = [workspaceId];

    if (filters.status) {
      params.push(filters.status);
      conditions.push(`s.status = $${params.length}`);
    }
    if (filters.minScore !== undefined) {
      params.push(filters.minScore);
      conditions.push(`s.icp_score >= $${params.length}`);
    }

    const limit = Math.min(filters.limit ?? 50, 200);
    const offset = filters.offset ?? 0;
    params.push(limit, offset);

    const res = await this.db.query<SessionRow>(
      `${SESSION_WITH_RESPONSE_SELECT}
       WHERE ${conditions.join(' AND ')}
       ORDER BY s.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return res.rows.map(toLead);
  }

  async getSessionWithTurns(
    workspaceId: string,
    sessionId: string
  ): Promise<{ session: Lead; turns: ConversationTurn[] } | null> {
    const sessionRes = await this.db.query<SessionRow>(
      `${SESSION_WITH_RESPONSE_SELECT} WHERE s.id = $1 AND s.workspace_id = $2`,
      [sessionId, workspaceId]
    );
    if (!sessionRes.rows[0]) return null;

    const turnsRes = await this.db.query<TurnRow>(
      'SELECT * FROM conversation_turns WHERE session_id = $1 ORDER BY created_at ASC',
      [sessionId]
    );

    return {
      session: toLead(sessionRes.rows[0]),
      turns: turnsRes.rows.map(toTurn),
    };
  }
}
