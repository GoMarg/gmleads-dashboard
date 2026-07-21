'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { CrmConnectPanel } from '@/components/crm-connect-panel';
import { CrmMappingForm } from '@/components/crm-mapping-form';
import { CrmActivityLogTable } from '@/components/crm-activity-log-table';

// KAN-71/72/73: nested under /leads, same as /leads/funnel and
// /leads/routing — inherits leads/layout.tsx's auth-gated shell
// unchanged. The `crm=connected|error` query param arrives here after
// the gateway's /api/crm/callback redirect resolves the OAuth flow.
export default function CrmPage(): React.ReactElement {
  const { workspaceId } = useAuth();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const crmResult = searchParams.get('crm');

  useEffect(() => {
    if (crmResult === 'connected') {
      void queryClient.invalidateQueries({ queryKey: ['crm-status', workspaceId] });
    }
  }, [crmResult, queryClient, workspaceId]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-lg font-semibold">CRM integration</h1>
      {crmResult === 'connected' && (
        <p className="text-sm text-green-700 dark:text-green-500">CRM connected successfully.</p>
      )}
      {crmResult === 'error' && (
        <p className="text-sm text-red-600">Could not connect the CRM. Please try again.</p>
      )}
      <CrmConnectPanel workspaceId={workspaceId} />
      <CrmMappingForm workspaceId={workspaceId} />
      <CrmActivityLogTable workspaceId={workspaceId} />
    </div>
  );
}
