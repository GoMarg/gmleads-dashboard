import type { IDatabase, Session, SessionStatus, ConversationTurn } from '@gmleads/shared';

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

function toSession(row: SessionRow): Session {
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

  async listLeads(workspaceId: string, filters: LeadFilters): Promise<Session[]> {
    const conditions = ['workspace_id = $1'];
    const params: unknown[] = [workspaceId];

    if (filters.status) {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
    }
    if (filters.minScore !== undefined) {
      params.push(filters.minScore);
      conditions.push(`icp_score >= $${params.length}`);
    }

    const limit = Math.min(filters.limit ?? 50, 200);
    const offset = filters.offset ?? 0;
    params.push(limit, offset);

    const res = await this.db.query<SessionRow>(
      `SELECT * FROM sessions
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return res.rows.map(toSession);
  }

  async getSessionWithTurns(
    workspaceId: string,
    sessionId: string
  ): Promise<{ session: Session; turns: ConversationTurn[] } | null> {
    const sessionRes = await this.db.query<SessionRow>(
      'SELECT * FROM sessions WHERE id = $1 AND workspace_id = $2',
      [sessionId, workspaceId]
    );
    if (!sessionRes.rows[0]) return null;

    const turnsRes = await this.db.query<TurnRow>(
      'SELECT * FROM conversation_turns WHERE session_id = $1 ORDER BY created_at ASC',
      [sessionId]
    );

    return {
      session: toSession(sessionRes.rows[0]),
      turns: turnsRes.rows.map(toTurn),
    };
  }
}
