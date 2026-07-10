// KAN-100: reuses @gmleads/shared's canonical Session/ConversationTurn
// shapes (see contracts.md) rather than redefining them — only overrides
// the Date fields, since Fastify serializes them as ISO strings over the
// wire and the shared types model the in-process (Date object) shape.
import type { Session, ConversationTurn, SessionStatus, AlertResponseAction } from '@gmleads/shared';

export type { SessionStatus, AlertResponseAction };

// KAN-59: every Lead is a Session enriched with response-time data — see
// gmleads-dashboard's leads.repo.ts, which always joins the two so this
// list and the session replay page can never disagree.
export type Lead = Omit<Session, 'createdAt' | 'alertedAt'> & {
  createdAt: string;
  alertedAt: string | null;
  responseAction: AlertResponseAction | null;
  responseTimeMs: number | null;
};

export type ConversationTurnDto = Omit<ConversationTurn, 'createdAt'> & {
  createdAt: string;
};

export interface LeadsResponse {
  leads: Lead[];
}

export interface SessionReplayResponse {
  session: Lead;
  turns: ConversationTurnDto[];
}

export interface LeadFilters {
  status?: SessionStatus;
  minScore?: number;
  limit?: number;
  offset?: number;
}

// KAN-59
export interface ResponseStats {
  avgMs: number | null;
  medianMs: number | null;
  respondedCount: number;
  noResponseCount: number;
}

// KAN-58
export interface FunnelStats {
  visitorCount: number;
  qualifiedCount: number;
  bookedCount: number;
}

// KAN-58
export interface DeliveryStats {
  p50Ms: number | null;
  p95Ms: number | null;
  successCount: number;
  failureCount: number;
}

export interface RespondResponse {
  action: AlertResponseAction;
  respondedAt: string;
}

// KAN-101
export interface WidgetStatus {
  lastSeenAt: string | null;
}
