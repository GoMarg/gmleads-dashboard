'use client';

import { useState } from 'react';
import {
  useDigestLogQuery,
  useDigestScheduleQuery,
  useUpdateDigestScheduleMutation,
} from '@/lib/queries';

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// KAN-76 — Decision 3: Slack only this wave, no email UI (email delivery is
// a Deferred External Blocker — see PROJECT_STATE.md — pending an SMTP/
// SendGrid/Resend credential).
export function DigestPanel({ workspaceId }: { workspaceId: string | null }): React.ReactElement {
  const { data: deliveries, isLoading } = useDigestLogQuery(workspaceId);
  const { data: schedule } = useDigestScheduleQuery(workspaceId);
  const updateSchedule = useUpdateDigestScheduleMutation(workspaceId);

  // Local edits are undefined until touched, same pattern as
  // crm-mapping-form.tsx — avoids syncing server data into state via an
  // effect, falling back to the fetched schedule until the user changes it.
  const [dayOfWeek, setDayOfWeek] = useState<number | undefined>(undefined);
  const [hourUtc, setHourUtc] = useState<number | undefined>(undefined);

  const currentDayOfWeek = dayOfWeek ?? schedule?.dayOfWeek ?? 1;
  const currentHourUtc = hourUtc ?? schedule?.hourUtc ?? 8;

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    updateSchedule.mutate({ dayOfWeek: currentDayOfWeek, hourUtc: currentHourUtc });
  };

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-black/60 dark:text-white/60">Weekly digest</h2>
      <p className="text-xs text-black/50 dark:text-white/50">
        Sent to this workspace&apos;s Slack channel — top scoring accounts and newly surfaced
        dark-funnel accounts.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          Day (UTC)
          <select
            value={currentDayOfWeek}
            onChange={(e) => setDayOfWeek(Number(e.target.value))}
            className="rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/15"
          >
            {DAY_LABELS.map((label, i) => (
              <option key={label} value={i}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Hour (UTC)
          <input
            type="number"
            min={0}
            max={23}
            value={currentHourUtc}
            onChange={(e) => setHourUtc(Number(e.target.value))}
            className="w-20 rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/15"
          />
        </label>
        <button
          type="submit"
          disabled={updateSchedule.isPending}
          className="rounded-md border border-black/10 px-3 py-1 text-sm dark:border-white/15"
        >
          Save schedule
        </button>
      </form>

      {isLoading && <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>}
      {deliveries && deliveries.length === 0 && (
        <p className="text-sm text-black/50 dark:text-white/50">No digest sent yet.</p>
      )}
      {deliveries && deliveries.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-black/50 dark:text-white/50">
              <th className="py-1">Sent</th>
              <th className="py-1">Channel</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map((d) => (
              <tr key={d.id} className="border-t border-black/10 dark:border-white/15">
                <td className="py-1">{new Date(d.sentAt).toLocaleString()}</td>
                <td className="py-1">{d.channel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
