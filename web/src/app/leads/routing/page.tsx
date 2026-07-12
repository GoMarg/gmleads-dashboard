'use client';

import { useAuth } from '@/lib/auth-context';
import { RepsPanel } from '@/components/reps-panel';
import { CsvUploadPanel } from '@/components/csv-upload-panel';
import { RoutingAuditTable } from '@/components/routing-audit-table';

// KAN-66/67/68/69: nested under /leads, same as /leads/funnel — inherits
// leads/layout.tsx's auth-gated shell unchanged.
export default function RoutingPage(): React.ReactElement {
  const { workspaceId } = useAuth();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-lg font-semibold">Lead routing</h1>
      <RepsPanel workspaceId={workspaceId} />
      <CsvUploadPanel workspaceId={workspaceId} />
      <RoutingAuditTable workspaceId={workspaceId} />
    </div>
  );
}
