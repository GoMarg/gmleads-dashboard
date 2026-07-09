'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useSessionReplayQuery } from '@/lib/queries';
import { SessionReplay } from '@/components/session-replay';
import { ApiError } from '@/lib/api-client';

export default function SessionReplayPage(): React.ReactElement {
  const { workspaceId } = useAuth();
  const params = useParams<{ sessionId: string }>();
  const { data, isLoading, error } = useSessionReplayQuery(workspaceId, params.sessionId);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/leads" className="text-sm text-black/60 hover:underline dark:text-white/60">
        ← Back to leads
      </Link>

      {isLoading && <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>}

      {error &&
        // 403 (tenant-isolation rejection) and 404 (unknown/other-workspace
        // session — the backend already 404s cross-workspace lookups, see
        // gmleads-dashboard's leads.repo.ts) both render the same explicit
        // "not found" state — never a blank page, never partial data
        // (KAN-100 AC3 / KAN-99's tenant isolation).
        (error instanceof ApiError && (error.status === 403 || error.status === 404) ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            This session doesn&apos;t exist or isn&apos;t part of your workspace.
          </p>
        ) : (
          <p className="text-sm text-red-600">Could not load this session. Please try again.</p>
        ))}

      {data && <SessionReplay session={data.session} turns={data.turns} />}
    </div>
  );
}
