// KAN-100: reuses @gmleads/shared's canonical Session/ConversationTurn
// shapes (see contracts.md) rather than redefining them — only overrides
// the Date fields, since Fastify serializes them as ISO strings over the
// wire and the shared types model the in-process (Date object) shape.
import type { Session, ConversationTurn, SessionStatus } from '@gmleads/shared';

export type { SessionStatus };

export type Lead = Omit<Session, 'createdAt' | 'alertedAt'> & {
  createdAt: string;
  alertedAt: string | null;
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
