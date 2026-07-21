'use client';

import { useState } from 'react';
import { useBusinessHoursQuery, useUpdateBusinessHoursMutation } from '@/lib/queries';
import type { BusinessHours } from '@/lib/types';

const DAYS: { key: keyof BusinessHours; label: string }[] = [
  { key: 'sun', label: 'Sunday' },
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
];

// KAN-55 (AC3) — the only consumer of this config is
// AvailabilityEvaluator (via gmleads-notification's availability route);
// this panel never evaluates availability itself, it only writes config.
export function BusinessHoursPanel({
  workspaceId,
}: {
  workspaceId: string | null;
}): React.ReactElement {
  const { data: config, isLoading } = useBusinessHoursQuery(workspaceId);
  const updateBusinessHours = useUpdateBusinessHoursMutation(workspaceId);

  // Same "local edits are undefined until touched" pattern as
  // digest-panel.tsx/crm-mapping-form.tsx — falls back to fetched data
  // until the user changes it, rather than syncing server state into
  // local state via an effect.
  const [draftHours, setDraftHours] = useState<BusinessHours | undefined>(undefined);
  const [draftTimezone, setDraftTimezone] = useState<string | undefined>(undefined);

  const hours = draftHours ?? config?.businessHours ?? {};
  const timezone = draftTimezone ?? config?.timezone ?? '';

  const setDay = (day: keyof BusinessHours, window: { open: string; close: string } | undefined): void => {
    const next = { ...hours };
    if (window) next[day] = window;
    else delete next[day];
    setDraftHours(next);
  };

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    updateBusinessHours.mutate({
      businessHours: Object.keys(hours).length > 0 ? hours : null,
      timezone: timezone.trim() || null,
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-black/60 dark:text-white/60">Business hours</h2>
      <p className="text-xs text-black/50 dark:text-white/50">
        When no rep is available outside these hours, the widget shows a passive booking
        recommendation to visitors. Leave a day unchecked if reps are never scheduled that day.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs">
          Timezone (IANA, e.g. America/New_York)
          <input
            type="text"
            value={timezone}
            onChange={(e) => setDraftTimezone(e.target.value)}
            placeholder="America/New_York"
            className="w-64 rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/15"
          />
        </label>

        <div className="flex flex-col gap-1">
          {DAYS.map(({ key, label }) => {
            const window = hours[key];
            const enabled = Boolean(window);
            return (
              <div key={key} className="flex items-center gap-2 text-xs">
                <label className="flex w-28 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) =>
                      setDay(key, e.target.checked ? { open: '09:00', close: '17:00' } : undefined)
                    }
                  />
                  {label}
                </label>
                <input
                  type="time"
                  value={window?.open ?? '09:00'}
                  disabled={!enabled}
                  onChange={(e) => setDay(key, { open: e.target.value, close: window?.close ?? '17:00' })}
                  className="rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm disabled:opacity-40 dark:border-white/15"
                />
                <span>to</span>
                <input
                  type="time"
                  value={window?.close ?? '17:00'}
                  disabled={!enabled}
                  onChange={(e) => setDay(key, { open: window?.open ?? '09:00', close: e.target.value })}
                  className="rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm disabled:opacity-40 dark:border-white/15"
                />
              </div>
            );
          })}
        </div>

        <button
          type="submit"
          disabled={updateBusinessHours.isPending || isLoading}
          className="w-fit rounded-md border border-black/10 px-3 py-1 text-sm dark:border-white/15"
        >
          Save business hours
        </button>
        {updateBusinessHours.isError && (
          <p className="text-xs text-red-600 dark:text-red-400">
            Could not save — check the timezone is a valid IANA name (e.g. America/New_York).
          </p>
        )}
      </form>

      {isLoading && <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>}
    </div>
  );
}
