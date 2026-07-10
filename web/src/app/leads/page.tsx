'use client';

import { useState, useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useLeadsQuery, useResponseStatsQuery } from '@/lib/queries';
import { LeadsTable } from '@/components/leads-table';
import { LeadsFilters, type LeadsFilterState } from '@/components/leads-filters';
import { ResponseStats, rangeToFromDate, type RangePreset } from '@/components/response-stats';

const PAGE_SIZE = 50;

export default function LeadsPage(): React.ReactElement {
  const { workspaceId } = useAuth();
  const [filters, setFilters] = useState<LeadsFilterState>({ status: '', minScore: '' });
  const [offset, setOffset] = useState(0);
  const [range, setRange] = useState<RangePreset>('7d');

  const minScore = filters.minScore.trim() === '' ? undefined : Number(filters.minScore);
  const { data, isLoading, isError } = useLeadsQuery(workspaceId, {
    status: filters.status || undefined,
    minScore,
    limit: PAGE_SIZE,
    offset,
  });
  // rangeToFromDate computes a fresh Date.now()-based string, so it must be
  // memoized on `range` alone — calling it inline on every render would
  // change the query's `from` value (and therefore its query key) each
  // render, defeating caching and re-fetching on every unrelated re-render.
  const from = useMemo(() => rangeToFromDate(range), [range]);
  const { data: stats } = useResponseStatsQuery(workspaceId, from);

  const handleFiltersChange = (next: LeadsFilterState): void => {
    setFilters(next);
    setOffset(0); // changing filters resets to the first page
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Leads</h1>

      <ResponseStats stats={stats} range={range} onRangeChange={setRange} />

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
