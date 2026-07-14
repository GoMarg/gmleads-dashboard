'use client';

import { useAuth } from '@/lib/auth-context';
import { BusinessHoursPanel } from '@/components/business-hours-panel';

// KAN-55 (AC3): nested under /leads, same pattern as /leads/digest.
export default function BusinessHoursPage(): React.ReactElement {
  const { workspaceId } = useAuth();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-lg font-semibold">Business hours</h1>
      <BusinessHoursPanel workspaceId={workspaceId} />
    </div>
  );
}
