import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch, uploadFile } from './api-client';
import type {
  LeadsResponse,
  SessionReplayResponse,
  LeadFilters,
  ResponseStats,
  RespondResponse,
  FunnelStats,
  DeliveryStats,
  WidgetStatus,
  IdentificationAccuracyStats,
  RepDto,
  AccountAssignmentDto,
  RoutingEventDto,
  CsvUploadResult,
  CrmStatus,
  CrmFieldMappingDto,
  CrmActivityPushDto,
  AccountScoreDto,
  DarkFunnelAccountDto,
  DarkFunnelSettings,
  DigestSchedule,
  DigestDeliveryDto,
  RepPerformanceStats,
  SlackStatus,
  SlackChannelDto,
  RepPresenceDto,
  BusinessHoursConfig,
} from './types';

function buildQueryString(filters: LeadFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.minScore !== undefined) params.set('minScore', String(filters.minScore));
  if (filters.identificationSource) params.set('identificationSource', filters.identificationSource);
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

// KAN-58 — funnel stage counts (visitor/qualified/booked) over an optional
// date range. Same `from`-only preset convention as KAN-59's response-stats
// query above (undefined = all-time).
export function useFunnelStatsQuery(workspaceId: string | null, from: string | undefined) {
  return useQuery({
    queryKey: ['funnel-stats', workspaceId, from],
    queryFn: () => {
      const qs = from ? `?from=${encodeURIComponent(from)}` : '';
      return authFetch<FunnelStats>(`/api/workspaces/${workspaceId}/analytics/funnel${qs}`);
    },
    enabled: Boolean(workspaceId),
  });
}

// KAN-58 — delivery latency p50/p95 + success/failure counts over an
// optional date range.
export function useDeliveryStatsQuery(workspaceId: string | null, from: string | undefined) {
  return useQuery({
    queryKey: ['delivery-stats', workspaceId, from],
    queryFn: () => {
      const qs = from ? `?from=${encodeURIComponent(from)}` : '';
      return authFetch<DeliveryStats>(`/api/workspaces/${workspaceId}/alerts/delivery-stats${qs}`);
    },
    enabled: Boolean(workspaceId),
  });
}

// KAN-40 — identification accuracy (resolved/unknown/failed/low-confidence
// counts) over an optional date range, same `from`-only convention as
// KAN-58's funnel/delivery-stats queries.
export function useIdentificationAccuracyQuery(
  workspaceId: string | null,
  from: string | undefined
) {
  return useQuery({
    queryKey: ['identification-accuracy', workspaceId, from],
    queryFn: () => {
      const qs = from ? `?from=${encodeURIComponent(from)}` : '';
      return authFetch<IdentificationAccuracyStats>(
        `/api/workspaces/${workspaceId}/analytics/identification-accuracy${qs}`
      );
    },
    enabled: Boolean(workspaceId),
  });
}

// KAN-101 — widget install-verification. No date range, no polling/
// refetchInterval — a single fetch per mount, same as every other query
// here (React Query's default staleTime/refetch-on-focus behavior
// already applies uniformly across the app; nothing added on top of it).
export function useWidgetStatusQuery(workspaceId: string | null) {
  return useQuery({
    queryKey: ['widget-status', workspaceId],
    queryFn: () => authFetch<WidgetStatus>(`/api/workspaces/${workspaceId}/widget-status`),
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

// KAN-66/67/68/69 — Lead Ownership & Routing.

export function useRepsQuery(workspaceId: string | null) {
  return useQuery({
    queryKey: ['reps', workspaceId],
    queryFn: () => authFetch<RepDto[]>(`/api/workspaces/${workspaceId}/reps`),
    enabled: Boolean(workspaceId),
  });
}

export function useCreateRepMutation(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; email: string; slackMemberId: string | null }) =>
      authFetch<RepDto>(`/api/workspaces/${workspaceId}/reps`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['reps', workspaceId] }),
  });
}

export function useUpdateRepMutation(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ repId, active }: { repId: string; active: boolean }) =>
      authFetch<RepDto>(`/api/workspaces/${workspaceId}/reps/${repId}`, {
        method: 'PATCH',
        body: JSON.stringify({ active }),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['reps', workspaceId] }),
  });
}

// KAN-65 — detection only, read-only. No mutation exists here on purpose:
// this signal isn't editable, it's observed from Slack.
export function useRepsPresenceQuery(workspaceId: string | null) {
  return useQuery({
    queryKey: ['reps-presence', workspaceId],
    queryFn: () => authFetch<RepPresenceDto[]>(`/api/workspaces/${workspaceId}/reps/presence`),
    enabled: Boolean(workspaceId),
  });
}

export function useAccountsQuery(workspaceId: string | null) {
  return useQuery({
    queryKey: ['accounts', workspaceId],
    queryFn: () => authFetch<AccountAssignmentDto[]>(`/api/workspaces/${workspaceId}/accounts`),
    enabled: Boolean(workspaceId),
  });
}

// Invalidates both accounts and reps queries — a large CSV upload is the
// main way an admin discovers typos in rep emails, so the reps list (which
// doesn't itself change) still needs to be fresh for the next attempt's
// dropdown/validation UI to reflect anything else added meanwhile.
export function useUploadAccountsCsvMutation(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) =>
      uploadFile<CsvUploadResult>(`/api/workspaces/${workspaceId}/accounts/upload`, file),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['accounts', workspaceId] }),
  });
}

export function useRoutingAuditQuery(workspaceId: string | null) {
  return useQuery({
    queryKey: ['routing-audit', workspaceId],
    queryFn: () => authFetch<RoutingEventDto[]>(`/api/workspaces/${workspaceId}/routing/audit`),
    enabled: Boolean(workspaceId),
  });
}

// KAN-71/72/73 — CRM Integration. No provider name in any of these
// paths — provider-neutral by design, matching the backend routes.

export function useCrmStatusQuery(workspaceId: string | null) {
  return useQuery({
    queryKey: ['crm-status', workspaceId],
    queryFn: () => authFetch<CrmStatus>(`/api/workspaces/${workspaceId}/crm/status`),
    enabled: Boolean(workspaceId),
  });
}

// Returns the authorizationUrl for the caller to navigate the browser to
// (window.location.href = ...) — this is a real OAuth redirect, not
// something React Query can render the result of.
export function useCrmConnectMutation(workspaceId: string | null) {
  return useMutation({
    mutationFn: () =>
      authFetch<{ authorizationUrl: string }>(`/api/workspaces/${workspaceId}/crm/connect`, {
        method: 'POST',
      }),
  });
}

export function useCrmMappingsQuery(workspaceId: string | null) {
  return useQuery({
    queryKey: ['crm-mappings', workspaceId],
    queryFn: () => authFetch<CrmFieldMappingDto[]>(`/api/workspaces/${workspaceId}/crm/mappings`),
    enabled: Boolean(workspaceId),
  });
}

export function useUpsertCrmMappingsMutation(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      mappings: Array<{ gmleadsField: string; crmProperty: string; objectType: 'contact' | 'company' }>
    ) =>
      authFetch<CrmFieldMappingDto[]>(`/api/workspaces/${workspaceId}/crm/mappings`, {
        method: 'PUT',
        body: JSON.stringify(mappings),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['crm-mappings', workspaceId] }),
  });
}

export function useCrmActivityLogQuery(workspaceId: string | null) {
  return useQuery({
    queryKey: ['crm-activity-log', workspaceId],
    queryFn: () => authFetch<CrmActivityPushDto[]>(`/api/workspaces/${workspaceId}/crm/activity-log`),
    enabled: Boolean(workspaceId),
  });
}

// KAN-48 — Slack OAuth. Additive alongside the legacy pasted-webhook setup
// (see ADR-018) — none of these paths mention a provider name, mirroring
// the CRM integration's provider-neutral route shape above.

export function useSlackStatusQuery(workspaceId: string | null) {
  return useQuery({
    queryKey: ['slack-status', workspaceId],
    queryFn: () => authFetch<SlackStatus>(`/api/workspaces/${workspaceId}/slack/status`),
    enabled: Boolean(workspaceId),
  });
}

// Returns the authorizationUrl for the caller to navigate the browser to
// (window.location.href = ...) — same OAuth-redirect shape as the CRM
// connect mutation above, not something React Query renders the result of.
export function useSlackConnectMutation(workspaceId: string | null) {
  return useMutation({
    mutationFn: () =>
      authFetch<{ authorizationUrl: string }>(`/api/workspaces/${workspaceId}/slack/connect`, {
        method: 'POST',
      }),
  });
}

// Only fetched once a connection exists (see SlackConnectPanel) — listing
// channels for a workspace with no Slack connection 409s.
export function useSlackChannelsQuery(workspaceId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['slack-channels', workspaceId],
    queryFn: () => authFetch<SlackChannelDto[]>(`/api/workspaces/${workspaceId}/slack/channels`),
    enabled: Boolean(workspaceId) && enabled,
  });
}

export function useSetSlackChannelMutation(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { channelId: string; channelName: string }) =>
      authFetch<{ defaultChannelId: string; defaultChannelName: string }>(
        `/api/workspaces/${workspaceId}/slack/channel`,
        { method: 'PUT', body: JSON.stringify(input) }
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['slack-status', workspaceId] }),
  });
}

export function useSlackDisconnectMutation(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      authFetch<{ success: boolean }>(`/api/workspaces/${workspaceId}/slack/disconnect`, {
        method: 'POST',
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['slack-status', workspaceId] }),
  });
}

// KAN-74/75/76/77 — Predictive Analytics (Wave 3). See ADR-016.

export function useAccountScoresQuery(workspaceId: string | null) {
  return useQuery({
    queryKey: ['account-scores', workspaceId],
    queryFn: () => authFetch<AccountScoreDto[]>(`/api/workspaces/${workspaceId}/analytics/account-scores`),
    enabled: Boolean(workspaceId),
  });
}

export function useAccountScoreHistoryQuery(workspaceId: string | null, matchKey: string | null) {
  return useQuery({
    queryKey: ['account-score-history', workspaceId, matchKey],
    queryFn: () =>
      authFetch<AccountScoreDto[]>(
        `/api/workspaces/${workspaceId}/analytics/account-scores/${encodeURIComponent(matchKey!)}/history`
      ),
    enabled: Boolean(workspaceId) && Boolean(matchKey),
  });
}

// Manual recompute — invalidates both scores and dark-funnel, since a
// single recompute route (KAN-74's AccountScoringService + KAN-75's
// DarkFunnelService) updates both.
export function useRecomputeAnalyticsMutation(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      authFetch<{ scoredCount: number; darkFunnelCount: number }>(
        `/api/workspaces/${workspaceId}/analytics/recompute`,
        { method: 'POST' }
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['account-scores', workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ['dark-funnel', workspaceId] });
    },
  });
}

export function useDarkFunnelQuery(workspaceId: string | null) {
  return useQuery({
    queryKey: ['dark-funnel', workspaceId],
    queryFn: () => authFetch<DarkFunnelAccountDto[]>(`/api/workspaces/${workspaceId}/analytics/dark-funnel`),
    enabled: Boolean(workspaceId),
  });
}

export function useDarkFunnelSettingsQuery(workspaceId: string | null) {
  return useQuery({
    queryKey: ['dark-funnel-settings', workspaceId],
    queryFn: () =>
      authFetch<DarkFunnelSettings>(`/api/workspaces/${workspaceId}/analytics/dark-funnel-settings`),
    enabled: Boolean(workspaceId),
  });
}

export function useUpdateDarkFunnelSettingsMutation(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: DarkFunnelSettings) =>
      authFetch<DarkFunnelSettings>(`/api/workspaces/${workspaceId}/analytics/dark-funnel-settings`, {
        method: 'PATCH',
        body: JSON.stringify(settings),
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['dark-funnel-settings', workspaceId] }),
  });
}

export function useRepPerformanceQuery(workspaceId: string | null) {
  return useQuery({
    queryKey: ['rep-performance', workspaceId],
    queryFn: () =>
      authFetch<RepPerformanceStats[]>(`/api/workspaces/${workspaceId}/analytics/rep-performance`),
    enabled: Boolean(workspaceId),
  });
}

export function useDigestLogQuery(workspaceId: string | null) {
  return useQuery({
    queryKey: ['digest-log', workspaceId],
    queryFn: () => authFetch<DigestDeliveryDto[]>(`/api/workspaces/${workspaceId}/analytics/digest-log`),
    enabled: Boolean(workspaceId),
  });
}

export function useDigestScheduleQuery(workspaceId: string | null) {
  return useQuery({
    queryKey: ['digest-schedule', workspaceId],
    queryFn: () => authFetch<DigestSchedule>(`/api/workspaces/${workspaceId}/analytics/digest-schedule`),
    enabled: Boolean(workspaceId),
  });
}

export function useUpdateDigestScheduleMutation(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (schedule: DigestSchedule) =>
      authFetch<DigestSchedule>(`/api/workspaces/${workspaceId}/analytics/digest-schedule`, {
        method: 'PATCH',
        body: JSON.stringify(schedule),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['digest-schedule', workspaceId] }),
  });
}

// KAN-55 (AC3) — not under /analytics/, matching the backend's own route
// choice (core workspace config, not an analytics setting).
export function useBusinessHoursQuery(workspaceId: string | null) {
  return useQuery({
    queryKey: ['business-hours', workspaceId],
    queryFn: () => authFetch<BusinessHoursConfig>(`/api/workspaces/${workspaceId}/business-hours`),
    enabled: Boolean(workspaceId),
  });
}

export function useUpdateBusinessHoursMutation(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: BusinessHoursConfig) =>
      authFetch<BusinessHoursConfig>(`/api/workspaces/${workspaceId}/business-hours`, {
        method: 'PATCH',
        body: JSON.stringify(config),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['business-hours', workspaceId] }),
  });
}
