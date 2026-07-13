'use client';

import { useAuth } from '@/lib/auth-context';
import { AccountScoresPanel } from '@/components/account-scores-panel';

// KAN-74: nested under /leads, same as /leads/routing and /leads/crm —
// inherits leads/layout.tsx's auth-gated shell unchanged. Also the target
// of the weekly digest's "View account scores" link (digest-blocks.ts).
export default function AccountScoresPage(): React.ReactElement {
  const { workspaceId } = useAuth();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-lg font-semibold">Account scores</h1>
      <AccountScoresPanel workspaceId={workspaceId} />
    </div>
  );
}
