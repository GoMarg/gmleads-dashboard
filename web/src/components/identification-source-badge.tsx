import type { Lead } from '@/lib/types';

// Audit finding (2026-07-25): leads-table.tsx and session-replay.tsx both
// rendered only `companyName ?? 'Unknown company'` — an ipapi-sourced
// result (an ISP/hosting-provider name guessed from the visitor's IP, not
// a real company match — see gmleads-agents/context/LEADFEEDER_INTEGRATION.md)
// looked exactly as confident as a genuine Leadfeeder match. A rep had no
// way to tell "Comcast Cable Communications LLC" apart from a real
// identified company just by looking at this page. This badge surfaces
// firmographics.source (already present on the Lead type, just never
// rendered) so that distinction is visible wherever a company name shows.
export function IdentificationSourceBadge({ lead }: { lead: Lead }): React.ReactElement | null {
  const source = lead.firmographics?.source;
  if (!lead.companyName || !source || source === 'leadfeeder') return null;

  if (source === 'ipapi') {
    return (
      <span
        className="ml-2 rounded bg-amber-500/10 px-1.5 py-0.5 text-xs font-normal normal-case text-amber-700 dark:text-amber-500"
        title="This name comes from the visitor's network provider (IP-based lookup), not a confirmed company match."
      >
        unverified
      </span>
    );
  }
  return null;
}
