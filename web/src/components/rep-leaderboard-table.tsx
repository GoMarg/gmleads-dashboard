'use client';

import { useRepPerformanceQuery } from '@/lib/queries';

function formatMs(ms: number | null): string {
  if (ms === null) return '—';
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)}m`;
}

// KAN-77: attributed via routing_events.rep_id, not actor-click identity
// (Decision 4 — see ADR-016). assignedCount is shown alongside the
// rate/avg metrics so a rep with a lot of round-robin volume isn't
// compared unfairly against one with less (AC: "account for round-robin
// volume differences, not just raw counts").
export function RepLeaderboardTable({ workspaceId }: { workspaceId: string | null }): React.ReactElement {
  const { data: stats, isLoading } = useRepPerformanceQuery(workspaceId);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-black/60 dark:text-white/60">Rep performance</h2>

      {isLoading && <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>}
      {stats && stats.length === 0 && (
        <p className="text-sm text-black/50 dark:text-white/50">
          No routed leads yet — this fills in once reps start receiving assignments.
        </p>
      )}
      {stats && stats.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-black/50 dark:text-white/50">
              <th className="py-1">Rep</th>
              <th className="py-1">Assigned</th>
              <th className="py-1">Responded</th>
              <th className="py-1">Booked</th>
              <th className="py-1">Avg response</th>
              <th className="py-1">Median response</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.repId} className="border-t border-black/10 dark:border-white/15">
                <td className="py-1">{s.repName}</td>
                <td className="py-1">{s.assignedCount}</td>
                <td className="py-1">{s.respondedCount}</td>
                <td className="py-1">{s.bookedCount}</td>
                <td className="py-1">{formatMs(s.avgResponseMs)}</td>
                <td className="py-1">{formatMs(s.medianResponseMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
