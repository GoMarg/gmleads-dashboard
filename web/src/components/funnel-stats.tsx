'use client';

import { StatTile } from './response-stats';
import type { FunnelStats as FunnelStatsData } from '@/lib/types';

// KAN-58: no charting library — a plain CSS width-scaled bar per stage is
// sufficient for a 3-stage funnel and keeps the frontend's zero-extra-
// dependency bias (see api-client.ts's "no axios" precedent).
function FunnelBar({
  label,
  count,
  maxCount,
}: {
  label: string;
  count: number;
  maxCount: number;
}): React.ReactElement {
  const widthPct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-black/60 dark:text-white/60">{count}</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
        <div
          className="h-3 rounded-full bg-blue-600 dark:bg-blue-500"
          style={{ width: `${widthPct}%` }}
        />
      </div>
    </div>
  );
}

function conversionPct(numerator: number, denominator: number): string {
  if (denominator === 0) return '—';
  return `${Math.round((numerator / denominator) * 100)}%`;
}

export function FunnelStats({
  stats,
}: {
  stats: FunnelStatsData | undefined;
}): React.ReactElement {
  const visitorCount = stats?.visitorCount ?? 0;
  const qualifiedCount = stats?.qualifiedCount ?? 0;
  const bookedCount = stats?.bookedCount ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-black/60 dark:text-white/60">Visitor funnel</h2>
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Visitors" value={String(visitorCount)} />
        <StatTile label="Qualified" value={String(qualifiedCount)} />
        <StatTile label="Booked" value={String(bookedCount)} />
      </div>
      <div className="flex flex-col gap-2">
        <FunnelBar label="Visitors" count={visitorCount} maxCount={visitorCount} />
        <FunnelBar label="Qualified" count={qualifiedCount} maxCount={visitorCount} />
        <FunnelBar label="Booked" count={bookedCount} maxCount={visitorCount} />
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm text-black/60 dark:text-white/60">
        <p>Visitor → Qualified: {conversionPct(qualifiedCount, visitorCount)}</p>
        <p>Qualified → Booked: {conversionPct(bookedCount, qualifiedCount)}</p>
      </div>
    </div>
  );
}
