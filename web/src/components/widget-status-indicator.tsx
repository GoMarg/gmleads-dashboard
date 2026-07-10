'use client';

import { useWidgetStatusQuery } from '@/lib/queries';
import type { WidgetStatus } from '@/lib/types';

// KAN-101: day-scale "time ago" phrasing. Deliberately not formatDuration
// (KAN-59) — that tops out at hours and is tuned for rep-response-time
// display, not multi-day install-verification windows.
function formatTimeAgo(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return 'just now';
  if (totalMinutes < 60) return `${totalMinutes}m ago`;
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) return `${totalHours}h ago`;
  const totalDays = Math.floor(totalHours / 24);
  return `${totalDays}d ago`;
}

function labelFor(status: WidgetStatus | undefined): string {
  if (!status || status.lastSeenAt === null) return 'Widget never seen';
  return `Widget active — last seen ${formatTimeAgo(Date.now() - new Date(status.lastSeenAt).getTime())}`;
}

// Single fetch on mount (React Query's standard default behavior, nothing
// added on top) — no polling, no refetchInterval, no live refresh.
export function WidgetStatusIndicator({
  workspaceId,
}: {
  workspaceId: string | null;
}): React.ReactElement | null {
  const { data } = useWidgetStatusQuery(workspaceId);
  if (!workspaceId) return null;

  return (
    <span className="text-xs text-black/50 dark:text-white/50">{labelFor(data)}</span>
  );
}
