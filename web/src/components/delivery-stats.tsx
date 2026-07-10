'use client';

import { StatTile } from './response-stats';
import type { DeliveryStats as DeliveryStatsData } from '@/lib/types';

// Slack delivery latency is typically sub-second to low-single-digit
// seconds — format-duration.ts's second-granularity rounding (built for
// minutes/hours-scale rep response times) would show "0s" or "1s" for most
// values here, hiding the differences that matter for this metric.
function formatLatency(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function DeliveryStats({
  stats,
}: {
  stats: DeliveryStatsData | undefined;
}): React.ReactElement {
  const successCount = stats?.successCount ?? 0;
  const failureCount = stats?.failureCount ?? 0;
  const total = successCount + failureCount;
  const successRate = total > 0 ? `${Math.round((successCount / total) * 100)}%` : '—';
  const failureRate = total > 0 ? `${Math.round((failureCount / total) * 100)}%` : '—';

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-black/60 dark:text-white/60">
        Alert delivery health
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="p50 latency"
          value={stats?.p50Ms != null ? formatLatency(stats.p50Ms) : '—'}
        />
        <StatTile
          label="p95 latency"
          value={stats?.p95Ms != null ? formatLatency(stats.p95Ms) : '—'}
        />
        <StatTile label="Success rate" value={successRate} />
        <StatTile label="Failure rate" value={failureRate} />
      </div>
    </div>
  );
}
