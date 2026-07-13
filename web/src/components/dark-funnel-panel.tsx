'use client';

import { useState } from 'react';
import {
  useDarkFunnelQuery,
  useDarkFunnelSettingsQuery,
  useUpdateDarkFunnelSettingsMutation,
} from '@/lib/queries';

// KAN-75: dark-funnel account list, distinct from chat-qualified leads
// (AC), plus the two tenant-configurable settings — Decision 5 deliberately
// excludes page-URL patterns from this form, those stay application
// configuration.
export function DarkFunnelPanel({ workspaceId }: { workspaceId: string | null }): React.ReactElement {
  const { data: accounts, isLoading } = useDarkFunnelQuery(workspaceId);
  const { data: settings } = useDarkFunnelSettingsQuery(workspaceId);
  const updateSettings = useUpdateDarkFunnelSettingsMutation(workspaceId);

  // Local edits are undefined until touched, same pattern as
  // crm-mapping-form.tsx — avoids syncing server data into state via an
  // effect, falling back to the fetched settings until the user types.
  const [visitThresholdCount, setVisitThresholdCount] = useState<number | undefined>(undefined);
  const [windowDays, setWindowDays] = useState<number | undefined>(undefined);

  const currentVisitThreshold = visitThresholdCount ?? settings?.visitThresholdCount ?? 3;
  const currentWindowDays = windowDays ?? settings?.windowDays ?? 14;

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    updateSettings.mutate({ visitThresholdCount: currentVisitThreshold, windowDays: currentWindowDays });
  };

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-black/60 dark:text-white/60">Dark funnel</h2>
      <p className="text-xs text-black/50 dark:text-white/50">
        Accounts with repeated site visits that have never opened the chat widget.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          Visit threshold
          <input
            type="number"
            min={1}
            value={currentVisitThreshold}
            onChange={(e) => setVisitThresholdCount(Number(e.target.value))}
            className="w-24 rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/15"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Window (days)
          <input
            type="number"
            min={1}
            value={currentWindowDays}
            onChange={(e) => setWindowDays(Number(e.target.value))}
            className="w-24 rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/15"
          />
        </label>
        <button
          type="submit"
          disabled={updateSettings.isPending}
          className="rounded-md border border-black/10 px-3 py-1 text-sm dark:border-white/15"
        >
          Save settings
        </button>
      </form>

      {isLoading && <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>}
      {accounts && accounts.length === 0 && (
        <p className="text-sm text-black/50 dark:text-white/50">
          No dark-funnel accounts right now.
        </p>
      )}
      {accounts && accounts.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-black/50 dark:text-white/50">
              <th className="py-1">Account</th>
              <th className="py-1">Visits</th>
              <th className="py-1">First qualified</th>
              <th className="py-1">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className="border-t border-black/10 dark:border-white/15">
                <td className="py-1">{a.matchKey}</td>
                <td className="py-1">{a.visitCount}</td>
                <td className="py-1 text-xs text-black/50 dark:text-white/50">
                  {new Date(a.firstQualifiedAt).toLocaleString()}
                </td>
                <td className="py-1 text-xs text-black/50 dark:text-white/50">
                  {new Date(a.lastActivityAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
