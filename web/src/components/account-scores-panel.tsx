'use client';

import { useAccountScoresQuery, useRecomputeAnalyticsMutation } from '@/lib/queries';

// KAN-74: current (latest per account) scores with a visible factor
// breakdown — the AC requires a rep can see *why* an account scored the
// way it did, not just the number, so every factor is always shown, not
// hidden behind a details toggle.
export function AccountScoresPanel({ workspaceId }: { workspaceId: string | null }): React.ReactElement {
  const { data: scores, isLoading } = useAccountScoresQuery(workspaceId);
  const recompute = useRecomputeAnalyticsMutation(workspaceId);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-black/60 dark:text-white/60">Account scores</h2>
        <button
          type="button"
          onClick={() => recompute.mutate()}
          disabled={recompute.isPending}
          className="rounded-md border border-black/10 px-3 py-1 text-xs dark:border-white/15"
        >
          {recompute.isPending ? 'Recomputing…' : 'Recompute now'}
        </button>
      </div>
      <p className="text-xs text-black/50 dark:text-white/50">
        Recomputed nightly. Scores blend firmographic fit with visit frequency, chat engagement, and
        high-intent page visits.
      </p>

      {isLoading && <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>}
      {scores && scores.length === 0 && (
        <p className="text-sm text-black/50 dark:text-white/50">
          No scored accounts yet — scores appear after the first recompute.
        </p>
      )}
      {scores && scores.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-black/50 dark:text-white/50">
              <th className="py-1">Account</th>
              <th className="py-1">Score</th>
              <th className="py-1">Firmographic fit</th>
              <th className="py-1">Visit frequency</th>
              <th className="py-1">Engagement depth</th>
              <th className="py-1">Intent signals</th>
              <th className="py-1">Computed</th>
            </tr>
          </thead>
          <tbody>
            {scores.map((s) => (
              <tr key={s.id} className="border-t border-black/10 dark:border-white/15">
                <td className="py-1">{s.matchKey}</td>
                <td className="py-1 font-semibold">{s.score}</td>
                <td className="py-1">{s.factors.firmographicFit}</td>
                <td className="py-1">{s.factors.visitFrequency}</td>
                <td className="py-1">{s.factors.engagementDepth}</td>
                <td className="py-1">{s.factors.intentSignals}</td>
                <td className="py-1 text-xs text-black/50 dark:text-white/50">
                  {new Date(s.computedAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
