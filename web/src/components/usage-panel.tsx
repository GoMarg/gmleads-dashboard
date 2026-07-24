'use client';

import { useUsageQuery } from '@/lib/queries';

function formatPeriod(periodStart: string): string {
  return new Date(periodStart).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

type CapStatus = 'ok' | 'approaching' | 'at_cap';

// KAN-82 (AC3): reuses the exact 80%/100% boundaries gmleads-shared's
// evaluateQuotaThreshold uses for internal alerting (KAN-60) — duplicated
// here as a plain constant, not imported, since browser code must never
// import the Node-only parent @gmleads/shared package (only type-only or
// deep /dist/schemas imports are safe from here — see gmleads-shared's own
// browser-safety notes). No new usage numbers are computed: this reads
// only the used/quota values the existing usage endpoint already returns.
const APPROACHING_THRESHOLD = 0.8;

function capStatus(used: number, quota: number): CapStatus {
  if (quota <= 0) return 'ok';
  if (used >= quota) return 'at_cap';
  if (used >= quota * APPROACHING_THRESHOLD) return 'approaching';
  return 'ok';
}

function CapBadge({ status }: { status: CapStatus }): React.ReactElement | null {
  if (status === 'ok') return null;
  const isAtCap = status === 'at_cap';
  return (
    <span
      data-testid="gml-cap-badge"
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        isAtCap
          ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
      }`}
    >
      {isAtCap ? 'At limit' : 'Approaching limit'}
    </span>
  );
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
  const status = capStatus(used, quota);
  const pct = quota > 0 ? Math.min(100, (used / quota) * 100) : 0;
  const barColor =
    status === 'at_cap'
      ? 'bg-red-600 dark:bg-red-500'
      : status === 'approaching'
        ? 'bg-amber-500 dark:bg-amber-400'
        : 'bg-black dark:bg-white';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60">{label}</h3>
        <CapBadge status={status} />
      </div>
      <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-black/50 dark:text-white/50">
        {used.toLocaleString()} of {quota.toLocaleString()} used
        {status === 'at_cap' && ' — over quota'}
      </p>
    </div>
  );
}

// KAN-60 — read-only, no mutation: quota itself is plan-configured, not
// tenant-editable from this panel. No AI-message meter — the product has
// no AI chat/LLM conversation feature to meter (see M8_DESIGN.md).
// KAN-82 (AC3) — each meter now shows an "Approaching limit"/"At limit"
// badge, computed entirely from the same used/quota numbers already
// fetched here; no new endpoint or metric.
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
