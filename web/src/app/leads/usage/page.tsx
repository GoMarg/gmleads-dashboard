'use client';

import { useAuth } from '@/lib/auth-context';
import { UsagePanel } from '@/components/usage-panel';

// KAN-60: nested under /leads, same pattern as /leads/business-hours.
export default function UsagePage(): React.ReactElement {
  const { workspaceId } = useAuth();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-lg font-semibold">Usage</h1>
      <UsagePanel workspaceId={workspaceId} />
    </div>
  );
}
