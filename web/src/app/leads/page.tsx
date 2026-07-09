'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useLeadsQuery } from '@/lib/queries';
import { LeadsTable } from '@/components/leads-table';
import { LeadsFilters, type LeadsFilterState } from '@/components/leads-filters';

const PAGE_SIZE = 50;

export default function LeadsPage(): React.ReactElement {
  const { workspaceId } = useAuth();
  const [filters, setFilters] = useState<LeadsFilterState>({ status: '', minScore: '' });
  const [offset, setOffset] = useState(0);

  const minScore = filters.minScore.trim() === '' ? undefined : Number(filters.minScore);
  const { data, isLoading, isError } = useLeadsQuery(workspaceId, {
    status: filters.status || undefined,
    minScore,
    limit: PAGE_SIZE,
    offset,
  });

  const handleFiltersChange = (next: LeadsFilterState): void => {
    setFilters(next);
    setOffset(0); // changing filters resets to the first page
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Leads</h1>
      <LeadsFilters value={filters} onChange={handleFiltersChange} />

      {isLoading && <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>}
      {isError && <p className="text-sm text-red-600">Could not load leads. Please try again.</p>}
      {data && (
        <>
          <LeadsTable leads={data.leads} />
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className="rounded-md border border-black/10 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-white/15"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={data.leads.length < PAGE_SIZE}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className="rounded-md border border-black/10 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-white/15"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
