'use client';

import { useAuth } from '@/lib/auth-context';
import { RepLeaderboardTable } from '@/components/rep-leaderboard-table';

// KAN-77: nested under /leads.
export default function RepPerformancePage(): React.ReactElement {
  const { workspaceId } = useAuth();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-lg font-semibold">Rep performance</h1>
      <RepLeaderboardTable workspaceId={workspaceId} />
    </div>
  );
}
