'use client';

import { useState } from 'react';
import { useWorkspaceProfileQuery } from '@/lib/queries';

const WIDGET_URL =
  process.env.NEXT_PUBLIC_WIDGET_URL ?? 'https://gmleads-widget-production.pages.dev/widget.js';

function snippetFor(embedKey: string): string {
  return `<script\n  src="${WIDGET_URL}"\n  data-key="${embedKey}"\n  async\n></script>`;
}

// A small "Copied" flash, not a persistent toast system — this page has
// exactly two copyable strings, not enough to justify a shared toast
// library/provider.
function CopyButton({ value, label }: { value: string; label: string }): React.ReactElement {
  const [copied, setCopied] = useState(false);

  const handleCopy = (): void => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="shrink-0 rounded-md border border-black/10 px-3 py-1 text-sm dark:border-white/15"
    >
      {copied ? 'Copied!' : label}
    </button>
  );
}

// Backend for this has existed since KAN-99 (POST /api/workspaces returns
// embedKey at signup) — but that response is a one-time thing at account
// creation. Nothing let a logged-in customer see their own key again after
// that, so installing the widget meant hitting the API directly. This page
// is the missing piece: GET /api/workspaces/:id (same jwtAuth tenant-
// isolation as every other dashboard route) plus a copy-paste snippet.
export function InstallPanel({ workspaceId }: { workspaceId: string | null }): React.ReactElement | null {
  const { data, isLoading, isError } = useWorkspaceProfileQuery(workspaceId);
  if (!workspaceId) return null;

  if (isLoading || !data) {
    return isError ? (
      <p className="text-sm text-red-600">Could not load your embed key. Please try again.</p>
    ) : (
      <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-black/60 dark:text-white/60">Embed key</h2>
        <div className="flex items-center gap-2">
          <code className="overflow-x-auto rounded-md border border-black/10 bg-black/[0.03] px-3 py-1.5 text-sm dark:border-white/15 dark:bg-white/[0.06]">
            {data.embedKey}
          </code>
          <CopyButton value={data.embedKey} label="Copy" />
        </div>
        <p className="text-xs text-black/50 dark:text-white/50">
          Identifies <strong>{data.name}</strong> to the widget — keep this out of public repos the
          same way you would an API key.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-black/60 dark:text-white/60">Install snippet</h2>
        <div className="flex items-start gap-2">
          <pre className="w-full overflow-x-auto rounded-md border border-black/10 bg-black/[0.03] px-3 py-2 text-xs dark:border-white/15 dark:bg-white/[0.06]">
            {snippetFor(data.embedKey)}
          </pre>
          <CopyButton value={snippetFor(data.embedKey)} label="Copy snippet" />
        </div>
        <p className="text-xs text-black/50 dark:text-white/50">
          Paste this once, anywhere in your page — <code>&lt;head&gt;</code> or <code>&lt;body&gt;</code>.
          Add <code>data-accent-color=&quot;#hex&quot;</code> to match your brand, or{' '}
          <code>data-label=&quot;Chat with {data.name}&quot;</code> to replace the default panel title.
          See the widget docs for the full attribute list.
        </p>
      </div>
    </div>
  );
}
