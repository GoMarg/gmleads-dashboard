'use client';

import type { SessionStatus } from '@/lib/types';

const STATUSES: SessionStatus[] = ['active', 'alerted', 'claimed', 'booked', 'ended'];

export interface LeadsFilterState {
  status: SessionStatus | '';
  minScore: string; // kept as raw string while editing; parsed by the caller
}

export function LeadsFilters({
  value,
  onChange,
}: {
  value: LeadsFilterState;
  onChange: (next: LeadsFilterState) => void;
}): React.ReactElement {
  return (
    <div className="flex items-end gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="status-filter" className="text-sm font-medium">
          Status
        </label>
        <select
          id="status-filter"
          value={value.status}
          onChange={(e) => onChange({ ...value, status: e.target.value as SessionStatus | '' })}
          className="rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/15"
        >
          <option value="">All</option>
          {STATUSES.map((status) => (
            <option key={status} value={status} className="capitalize">
              {status}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="min-score-filter" className="text-sm font-medium">
          Min score
        </label>
        <input
          id="min-score-filter"
          type="number"
          min={0}
          max={100}
          value={value.minScore}
          onChange={(e) => onChange({ ...value, minScore: e.target.value })}
          className="w-24 rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/15"
        />
      </div>
    </div>
  );
}
