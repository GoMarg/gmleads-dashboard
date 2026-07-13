'use client';

import { useAuth } from '@/lib/auth-context';
import { DigestPanel } from '@/components/digest-panel';

// KAN-76: nested under /leads.
export default function DigestPage(): React.ReactElement {
  const { workspaceId } = useAuth();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-lg font-semibold">Weekly digest</h1>
      <DigestPanel workspaceId={workspaceId} />
    </div>
  );
}
