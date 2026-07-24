'use client';

import { useUsageQuery } from '@/lib/queries';

function formatPeriod(periodStart: string): string {
  return new Date(periodStart).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function UsageMeter({
  label,
  used,
  quota,
}: {
  label: string;
  used: number;
  quota: number;
}): React.ReactElement {
  const pct = quota > 0 ? Math.min(100, (used / quota) * 100) : 0;
  const overQuota = used > quota;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-black/60 dark:text-white/60">{label}</h3>
      <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div
          className={`h-full rounded-full ${overQuota ? 'bg-red-600 dark:bg-red-500' : 'bg-black dark:bg-white'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-black/50 dark:text-white/50">
        {used.toLocaleString()} of {quota.toLocaleString()} used
        {overQuota && ' — over quota'}
      </p>
    </div>
  );
}

// KAN-60 — read-only, no mutation: quota itself is plan-configured, not
// tenant-editable from this panel. No AI-message meter — the product has
// no AI chat/LLM conversation feature to meter (see M8_DESIGN.md).
export function UsagePanel({ workspaceId }: { workspaceId: string | null }): React.ReactElement | null {
  const { data, isLoading } = useUsageQuery(workspaceId);
  if (!workspaceId) return null;

  if (isLoading || !data) {
    return <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-black/60 dark:text-white/60">
        Usage — {formatPeriod(data.periodStart)}
      </h2>
      <UsageMeter label="Sessions" used={data.sessionsUsed} quota={data.sessionsQuota} />
      <UsageMeter
        label="Enrichment lookups"
        used={data.enrichmentLookupsUsed}
        quota={data.enrichmentLookupsQuota}
      />
    </div>
  );
}
