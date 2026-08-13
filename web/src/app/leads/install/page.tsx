'use client';

import { useAuth } from '@/lib/auth-context';
import { InstallPanel } from '@/components/install-panel';

// Nested under /leads, same pattern as /leads/usage — the missing piece for
// self-serve onboarding: POST /api/workspaces has always returned embedKey
// at signup, but nothing let a logged-in customer see it again afterward.
export default function InstallPage(): React.ReactElement {
  const { workspaceId } = useAuth();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-lg font-semibold">Install</h1>
      <InstallPanel workspaceId={workspaceId} />
    </div>
  );
}
