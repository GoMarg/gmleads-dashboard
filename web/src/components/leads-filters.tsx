'use client';

import type { SessionStatus } from '@/lib/types';

const STATUSES: SessionStatus[] = ['active', 'alerted', 'claimed', 'booked', 'ended'];

// KAN-40: 'failed' is a sentinel (no firmographics at all), not a real
// Firmographics.source value — see leads.repo.ts's IdentificationSourceFilter.
const IDENTIFICATION_SOURCES = ['leadfeeder', 'ipapi', 'unknown', 'failed'] as const;
type IdentificationSourceFilterValue = (typeof IDENTIFICATION_SOURCES)[number];

export interface LeadsFilterState {
  status: SessionStatus | '';
  minScore: string; // kept as raw string while editing; parsed by the caller
  identificationSource: IdentificationSourceFilterValue | '';
  hideSnoozed: boolean;
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

      <div className="flex flex-col gap-1">
        <label htmlFor="identification-source-filter" className="text-sm font-medium">
          Identification
        </label>
        <select
          id="identification-source-filter"
          value={value.identificationSource}
          onChange={(e) =>
            onChange({
              ...value,
              identificationSource: e.target.value as IdentificationSourceFilterValue | '',
            })
          }
          className="rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/15"
        >
          <option value="">All</option>
          {IDENTIFICATION_SOURCES.map((source) => (
            <option key={source} value={source} className="capitalize">
              {source}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 pb-1.5">
        <input
          id="hide-snoozed-filter"
          type="checkbox"
          checked={value.hideSnoozed}
          onChange={(e) => onChange({ ...value, hideSnoozed: e.target.checked })}
        />
        <label htmlFor="hide-snoozed-filter" className="text-sm font-medium">
          Hide snoozed
        </label>
      </div>
    </div>
  );
}
