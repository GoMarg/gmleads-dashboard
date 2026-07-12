// KAN-100: reuses @gmleads/shared's canonical Session/ConversationTurn
// shapes (see contracts.md) rather than redefining them — only overrides
// the Date fields, since Fastify serializes them as ISO strings over the
// wire and the shared types model the in-process (Date object) shape.
import type {
  Session,
  ConversationTurn,
  SessionStatus,
  AlertResponseAction,
  Rep,
  AccountAssignment,
  RoutingEvent,
} from '@gmleads/shared';

export type { SessionStatus, AlertResponseAction };

// KAN-66/67/68/69 — same Date -> ISO-string override pattern as Lead below.
export type RepDto = Omit<Rep, 'createdAt'> & { createdAt: string };
export type AccountAssignmentDto = Omit<AccountAssignment, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};
export type RoutingEventDto = Omit<RoutingEvent, 'createdAt'> & { createdAt: string };

export interface CsvUploadResultRow {
  row: number;
  status: 'ok' | 'error';
  account?: string;
  error?: string;
}

export interface CsvUploadResult {
  successCount: number;
  errorCount: number;
  results: CsvUploadResultRow[];
}

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

// KAN-40: 'failed' is a sentinel (no firmographics at all), not a real
// Firmographics.source value.
export type IdentificationSourceFilter = 'leadfeeder' | 'ipapi' | 'unknown' | 'failed';

export interface LeadFilters {
  status?: SessionStatus;
  minScore?: number;
  identificationSource?: IdentificationSourceFilter;
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

// KAN-40
export interface IdentificationAccuracyStats {
  resolvedCount: number;
  unknownCount: number;
  failedCount: number;
  lowConfidenceCount: number;
}

export interface RespondResponse {
  action: AlertResponseAction;
  respondedAt: string;
}

// KAN-101
export interface WidgetStatus {
  lastSeenAt: string | null;
}
