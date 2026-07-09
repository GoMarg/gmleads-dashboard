import { useQuery } from '@tanstack/react-query';
import { authFetch } from './api-client';
import type { LeadsResponse, SessionReplayResponse, LeadFilters } from './types';

function buildQueryString(filters: LeadFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.minScore !== undefined) params.set('minScore', String(filters.minScore));
  if (filters.limit !== undefined) params.set('limit', String(filters.limit));
  if (filters.offset !== undefined) params.set('offset', String(filters.offset));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

// workspaceId is required (not optional) on purpose — every call site must
// get it from useAuth()'s authenticated context, never from a route param
// or other user-editable input (see ADR-014's tenant-isolation section).
// `enabled: Boolean(workspaceId)` at each call site prevents firing before
// the auth bootstrap resolves it.
export function useLeadsQuery(workspaceId: string | null, filters: LeadFilters) {
  return useQuery({
    queryKey: ['leads', workspaceId, filters],
    queryFn: () =>
      authFetch<LeadsResponse>(`/api/workspaces/${workspaceId}/leads${buildQueryString(filters)}`),
    enabled: Boolean(workspaceId),
  });
}

export function useSessionReplayQuery(workspaceId: string | null, sessionId: string | null) {
  return useQuery({
    queryKey: ['session-replay', workspaceId, sessionId],
    queryFn: () =>
      authFetch<SessionReplayResponse>(`/api/workspaces/${workspaceId}/sessions/${sessionId}`),
    enabled: Boolean(workspaceId) && Boolean(sessionId),
  });
}
