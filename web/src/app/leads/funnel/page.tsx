'use client';

import { useState, useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useFunnelStatsQuery, useDeliveryStatsQuery, useIdentificationAccuracyQuery } from '@/lib/queries';
import { FunnelStats } from '@/components/funnel-stats';
import { DeliveryStats } from '@/components/delivery-stats';
import { IdentificationAccuracyStats } from '@/components/identification-accuracy-stats';
import { rangeToFromDate, RANGE_LABELS, type RangePreset } from '@/components/response-stats';

// KAN-58: nested under /leads (rather than a new top-level /funnel route)
// so it inherits leads/layout.tsx's existing auth-gated shell unchanged —
// that layout's own comment already anticipated this ticket attaching here
// without reworking it.
export default function FunnelPage(): React.ReactElement {
  const { workspaceId } = useAuth();
  const [range, setRange] = useState<RangePreset>('7d');
  // Same reasoning as leads/page.tsx's `from` memoization: rangeToFromDate
  // is Date.now()-based, so it must be memoized on `range` alone or every
  // render produces a new query key and both queries refetch continuously.
  const from = useMemo(() => rangeToFromDate(range), [range]);

  // One shared range selector drives both queries below — not two
  // independent selectors — so the funnel and delivery-health sections
  // always describe the same window.
  const {
    data: funnel,
    isLoading: funnelLoading,
    isError: funnelError,
  } = useFunnelStatsQuery(workspaceId, from);
  const {
    data: delivery,
    isLoading: deliveryLoading,
    isError: deliveryError,
  } = useDeliveryStatsQuery(workspaceId, from);
  const {
    data: identificationAccuracy,
    isLoading: identificationLoading,
    isError: identificationError,
  } = useIdentificationAccuracyQuery(workspaceId, from);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Funnel &amp; delivery analytics</h1>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value as RangePreset)}
          className="rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/15"
        >
          {(Object.keys(RANGE_LABELS) as RangePreset[]).map((key) => (
            <option key={key} value={key}>
              {RANGE_LABELS[key]}
            </option>
          ))}
        </select>
      </div>

      {(funnelLoading || deliveryLoading || identificationLoading) && (
        <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>
      )}
      {(funnelError || deliveryError || identificationError) && (
        <p className="text-sm text-red-600">Could not load analytics. Please try again.</p>
      )}

      <FunnelStats stats={funnel} />
      <DeliveryStats stats={delivery} />
      <IdentificationAccuracyStats stats={identificationAccuracy} />
    </div>
  );
}
