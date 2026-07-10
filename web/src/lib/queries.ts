import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from './api-client';
import type {
  LeadsResponse,
  SessionReplayResponse,
  LeadFilters,
  ResponseStats,
  RespondResponse,
} from './types';

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

// KAN-59 — avg/median response time + responded/no-response counts. `range`
// is `undefined` for all-time; otherwise an ISO `from` bound, per the
// simple presets the UI offers (see leads/page.tsx) rather than a full
// date-range picker.
export function useResponseStatsQuery(workspaceId: string | null, from: string | undefined) {
  return useQuery({
    queryKey: ['response-stats', workspaceId, from],
    queryFn: () => {
      const qs = from ? `?from=${encodeURIComponent(from)}` : '';
      return authFetch<ResponseStats>(`/api/workspaces/${workspaceId}/alerts/response-stats${qs}`);
    },
    enabled: Boolean(workspaceId),
  });
}

// KAN-59 — records a claim/dismiss action. Invalidates both the leads list
// and this session's replay query so the UI reflects the (possibly
// already-someone-else's) persisted response immediately, rather than
// waiting for the next natural refetch.
export function useRespondMutation(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, action }: { sessionId: string; action: 'claimed' | 'dismissed' }) =>
      authFetch<RespondResponse>(`/api/workspaces/${workspaceId}/sessions/${sessionId}/respond`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads', workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ['session-replay', workspaceId] });
    },
  });
}
