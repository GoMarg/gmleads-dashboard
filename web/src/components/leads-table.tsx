'use client';

import Link from 'next/link';
import type { Lead } from '@/lib/types';

export function LeadsTable({ leads }: { leads: Lead[] }): React.ReactElement {
  if (leads.length === 0) {
    return <p className="text-sm text-black/50 dark:text-white/50">No leads match these filters.</p>;
  }

  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-black/10 text-black/60 dark:border-white/15 dark:text-white/60">
          <th className="py-2 pr-4 font-medium">Company</th>
          <th className="py-2 pr-4 font-medium">Status</th>
          <th className="py-2 pr-4 font-medium">Score</th>
          <th className="py-2 pr-4 font-medium">Created</th>
        </tr>
      </thead>
      <tbody>
        {leads.map((lead) => (
          <tr key={lead.id} className="border-b border-black/5 dark:border-white/10">
            <td className="py-2 pr-4">
              <Link href={`/leads/${lead.id}`} className="font-medium hover:underline">
                {lead.companyName ?? 'Unknown company'}
              </Link>
            </td>
            <td className="py-2 pr-4 capitalize">{lead.status}</td>
            <td className="py-2 pr-4">{lead.icpScore}</td>
            <td className="py-2 pr-4 text-black/60 dark:text-white/60">
              {new Date(lead.createdAt).toLocaleString()}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
