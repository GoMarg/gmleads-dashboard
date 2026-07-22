'use client';

import { useUsageQuery } from '@/lib/queries';

function formatPeriod(periodStart: string): string {
  return new Date(periodStart).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

// KAN-60 — read-only, no mutation: quota itself is plan-configured, not
// tenant-editable from this panel.
export function UsagePanel({ workspaceId }: { workspaceId: string | null }): React.ReactElement | null {
  const { data, isLoading } = useUsageQuery(workspaceId);
  if (!workspaceId) return null;

  if (isLoading || !data) {
    return <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>;
  }

  const pct = data.sessionsQuota > 0 ? Math.min(100, (data.sessionsUsed / data.sessionsQuota) * 100) : 0;
  const overQuota = data.sessionsUsed > data.sessionsQuota;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-black/60 dark:text-white/60">
        Sessions — {formatPeriod(data.periodStart)}
      </h2>
      <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div
          className={`h-full rounded-full ${overQuota ? 'bg-red-600 dark:bg-red-500' : 'bg-black dark:bg-white'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-black/50 dark:text-white/50">
        {data.sessionsUsed.toLocaleString()} of {data.sessionsQuota.toLocaleString()} sessions used
        {overQuota && ' — over quota'}
      </p>
    </div>
  );
}
