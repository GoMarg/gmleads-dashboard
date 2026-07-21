'use client';

import { useCrmActivityLogQuery } from '@/lib/queries';

const SOURCE_LABELS: Record<string, string> = {
  lead_qualified: 'Lead qualified',
  meeting_booked: 'Meeting booked',
};

// KAN-73: surfaces failed pushes (both retry attempts exhausted) so a
// tenant admin notices, per the explicit AC — this table is the only
// place that failure state is visible.
export function CrmActivityLogTable({ workspaceId }: { workspaceId: string | null }): React.ReactElement {
  const { data: pushes, isLoading } = useCrmActivityLogQuery(workspaceId);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-black/60 dark:text-white/60">CRM activity log</h2>
      {isLoading && <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>}
      {pushes && pushes.length === 0 && (
        <p className="text-sm text-black/50 dark:text-white/50">No CRM activity pushed yet.</p>
      )}
      {pushes && pushes.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-black/50 dark:text-white/50">
              <th className="py-1">When</th>
              <th className="py-1">Event</th>
              <th className="py-1">Status</th>
              <th className="py-1">Detail</th>
            </tr>
          </thead>
          <tbody>
            {pushes.map((push) => (
              <tr key={push.id} className="border-t border-black/10 dark:border-white/15">
                <td className="py-1">{new Date(push.createdAt).toLocaleString()}</td>
                <td className="py-1">{SOURCE_LABELS[push.sourceType] ?? push.sourceType}</td>
                <td className={`py-1 ${push.status === 'failed' ? 'text-red-600' : ''}`}>
                  {push.status === 'success' ? 'Success' : 'Failed'}
                </td>
                <td className="py-1">{push.status === 'success' ? push.crmRecordId : push.errorMessage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
