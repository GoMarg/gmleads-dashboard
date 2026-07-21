'use client';

import { useState } from 'react';
import { useCrmMappingsQuery, useUpsertCrmMappingsMutation } from '@/lib/queries';

// GmLeads-side fields available to map — provider-agnostic (the CRM
// property name on the other side is always free text the admin fills
// in, since it depends on whichever CRM is actually connected).
const GMLEADS_FIELDS = [
  { field: 'company_name', label: 'Company name', objectType: 'company' as const },
  { field: 'icp_score', label: 'ICP score', objectType: 'company' as const },
  { field: 'prospect_email', label: 'Prospect email', objectType: 'contact' as const },
  { field: 'prospect_name', label: 'Prospect name', objectType: 'contact' as const },
];

export function CrmMappingForm({ workspaceId }: { workspaceId: string | null }): React.ReactElement {
  const { data: mappings } = useCrmMappingsQuery(workspaceId);
  const upsert = useUpsertCrmMappingsMutation(workspaceId);
  const [values, setValues] = useState<Record<string, string>>({});

  const currentValue = (field: string): string =>
    values[field] ?? mappings?.find((m) => m.gmleadsField === field)?.crmProperty ?? '';

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    const payload = GMLEADS_FIELDS.filter((f) => currentValue(f.field).trim() !== '').map((f) => ({
      gmleadsField: f.field,
      crmProperty: currentValue(f.field).trim(),
      objectType: f.objectType,
    }));
    if (payload.length === 0) return;
    upsert.mutate(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-black/60 dark:text-white/60">Field mapping</h2>
      <p className="text-xs text-black/50 dark:text-white/50">
        Map each GmLeads field to the matching property name in your connected CRM.
      </p>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-xs text-black/50 dark:text-white/50">
            <th className="py-1">GmLeads field</th>
            <th className="py-1">CRM property</th>
          </tr>
        </thead>
        <tbody>
          {GMLEADS_FIELDS.map((f) => (
            <tr key={f.field} className="border-t border-black/10 dark:border-white/15">
              <td className="py-1">{f.label}</td>
              <td className="py-1">
                <input
                  value={currentValue(f.field)}
                  onChange={(e) => setValues((prev) => ({ ...prev, [f.field]: e.target.value }))}
                  className="w-full rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/15"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="submit"
        disabled={upsert.isPending}
        className="self-start rounded-md border border-black/10 px-3 py-1 text-sm dark:border-white/15"
      >
        Save mapping
      </button>
      {upsert.isError && <p className="text-sm text-red-600">Could not save the mapping.</p>}
      {upsert.isSuccess && <p className="text-sm text-green-700 dark:text-green-500">Saved.</p>}
    </form>
  );
}
