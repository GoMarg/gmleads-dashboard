'use client';

import { useRepsQuery, useRoutingAuditQuery } from '@/lib/queries';

const METHOD_LABELS: Record<string, string> = {
  direct: 'Direct match',
  round_robin: 'Round-robin',
  fallback: 'No reps configured',
};

// KAN-69: exposes the audit trail written by gmleads-notification's
// RoutingStrategy engine — this table is read-only, it never writes
// routing_events itself. Cross-references reps (already fetched for the
// reps panel) to show a name instead of a bare UUID.
export function RoutingAuditTable({ workspaceId }: { workspaceId: string | null }): React.ReactElement {
  const { data: events, isLoading } = useRoutingAuditQuery(workspaceId);
  const { data: reps } = useRepsQuery(workspaceId);

  const repName = (repId: string | null): string => {
    if (!repId) return '—';
    return reps?.find((r) => r.id === repId)?.name ?? repId;
  };

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-black/60 dark:text-white/60">Routing audit log</h2>
      {isLoading && <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>}
      {events && events.length === 0 && (
        <p className="text-sm text-black/50 dark:text-white/50">No routing decisions yet.</p>
      )}
      {events && events.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-black/50 dark:text-white/50">
              <th className="py-1">When</th>
              <th className="py-1">Method</th>
              <th className="py-1">Matched</th>
              <th className="py-1">Routed to</th>
              <th className="py-1">Session</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className="border-t border-black/10 dark:border-white/15">
                <td className="py-1">{new Date(event.createdAt).toLocaleString()}</td>
                <td className="py-1">{METHOD_LABELS[event.method] ?? event.method}</td>
                <td className="py-1">{event.matchedKey ?? '—'}</td>
                <td className="py-1">{repName(event.repId)}</td>
                <td className="py-1 font-mono text-xs">{event.sessionId.slice(0, 8)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
