'use client';

import { useAuth } from '@/lib/auth-context';
import { DarkFunnelPanel } from '@/components/dark-funnel-panel';

// KAN-75: nested under /leads. Also the target of the weekly digest's
// "View dark funnel" link (digest-blocks.ts).
export default function DarkFunnelPage(): React.ReactElement {
  const { workspaceId } = useAuth();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-lg font-semibold">Dark funnel</h1>
      <DarkFunnelPanel workspaceId={workspaceId} />
    </div>
  );
}
