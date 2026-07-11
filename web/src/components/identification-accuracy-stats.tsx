'use client';

import { StatTile } from './response-stats';
import type { IdentificationAccuracyStats as IdentificationAccuracyStatsData } from '@/lib/types';

export function IdentificationAccuracyStats({
  stats,
}: {
  stats: IdentificationAccuracyStatsData | undefined;
}): React.ReactElement {
  const resolvedCount = stats?.resolvedCount ?? 0;
  const unknownCount = stats?.unknownCount ?? 0;
  const failedCount = stats?.failedCount ?? 0;
  const lowConfidenceCount = stats?.lowConfidenceCount ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-black/60 dark:text-white/60">
        Identification accuracy
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Resolved" value={String(resolvedCount)} />
        <StatTile label="Unknown" value={String(unknownCount)} />
        <StatTile label="Failed" value={String(failedCount)} />
        <StatTile label="Low confidence" value={String(lowConfidenceCount)} />
      </div>
    </div>
  );
}
