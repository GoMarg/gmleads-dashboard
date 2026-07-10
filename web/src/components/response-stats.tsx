'use client';

import { formatDuration } from '@/lib/format-duration';
import type { ResponseStats as ResponseStatsData } from '@/lib/types';

export type RangePreset = '7d' | '30d' | 'all';

// Exported so KAN-58's funnel/delivery-stats panels reuse the same three
// presets and labels rather than redefining them.
export const RANGE_LABELS: Record<RangePreset, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  all: 'All time',
};

export function rangeToFromDate(range: RangePreset): string | undefined {
  if (range === 'all') return undefined;
  const days = range === '7d' ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// Exported so KAN-58's funnel and delivery-stats panels reuse this exact
// tile rather than redefining it — see funnel-stats.tsx/delivery-stats.tsx.
export function StatTile({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="rounded-md border border-black/10 px-4 py-3 dark:border-white/15">
      <p className="text-xs text-black/50 dark:text-white/50">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

export function ResponseStats({
  stats,
  range,
  onRangeChange,
}: {
  stats: ResponseStatsData | undefined;
  range: RangePreset;
  onRangeChange: (range: RangePreset) => void;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-black/60 dark:text-white/60">
          Alert response time
        </h2>
        <select
          value={range}
          onChange={(e) => onRangeChange(e.target.value as RangePreset)}
          className="rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/15"
        >
          {(Object.keys(RANGE_LABELS) as RangePreset[]).map((key) => (
            <option key={key} value={key}>
              {RANGE_LABELS[key]}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Average" value={stats?.avgMs != null ? formatDuration(stats.avgMs) : '—'} />
        <StatTile label="Median" value={stats?.medianMs != null ? formatDuration(stats.medianMs) : '—'} />
        <StatTile label="Responded" value={String(stats?.respondedCount ?? 0)} />
        <StatTile label="No response" value={String(stats?.noResponseCount ?? 0)} />
      </div>
    </div>
  );
}
