'use client';

import { useRef, useState } from 'react';
import { useUploadAccountsCsvMutation, useAccountsQuery } from '@/lib/queries';
import type { CsvUploadResult } from '@/lib/types';

// KAN-66: CSV columns must be literally named `account` (a domain or
// company name) and `repEmail` (must match an existing rep's email
// exactly) — matches the backend's accountCsvRowSchema field names.
export function CsvUploadPanel({ workspaceId }: { workspaceId: string | null }): React.ReactElement {
  const upload = useUploadAccountsCsvMutation(workspaceId);
  const { data: accounts } = useAccountsQuery(workspaceId);
  const [lastResult, setLastResult] = useState<CsvUploadResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) return;
    upload.mutate(file, { onSuccess: setLastResult });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-black/60 dark:text-white/60">
        Account list ({accounts?.length ?? 0} mapped)
      </h2>
      <p className="text-xs text-black/50 dark:text-white/50">
        CSV with columns <code>account</code> (domain or company name) and{' '}
        <code>repEmail</code>. Re-uploading updates existing mappings.
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleFileChange}
        disabled={upload.isPending}
        className="text-sm"
      />
      {upload.isPending && <p className="text-sm text-black/50 dark:text-white/50">Uploading…</p>}
      {upload.isError && <p className="text-sm text-red-600">Upload failed. Please try again.</p>}

      {lastResult && (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            {lastResult.successCount} mapped, {lastResult.errorCount} error
            {lastResult.errorCount === 1 ? '' : 's'}.
          </p>
          {lastResult.errorCount > 0 && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-black/50 dark:text-white/50">
                  <th className="py-1">Row</th>
                  <th className="py-1">Account</th>
                  <th className="py-1">Error</th>
                </tr>
              </thead>
              <tbody>
                {lastResult.results
                  .filter((r) => r.status === 'error')
                  .map((r) => (
                    <tr key={r.row} className="border-t border-black/10 dark:border-white/15">
                      <td className="py-1">{r.row}</td>
                      <td className="py-1">{r.account ?? '—'}</td>
                      <td className="py-1 text-red-600">{r.error}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
