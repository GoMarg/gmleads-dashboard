'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { SlackConnectPanel } from '@/components/slack-connect-panel';

// KAN-48: nested under /leads, same as /leads/crm — inherits
// leads/layout.tsx's auth-gated shell unchanged. The `slack=connected|error`
// query param arrives here after the gateway's /api/slack/callback
// redirect resolves the OAuth flow.
export default function SlackPage(): React.ReactElement {
  const { workspaceId } = useAuth();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const slackResult = searchParams.get('slack');

  useEffect(() => {
    if (slackResult === 'connected') {
      void queryClient.invalidateQueries({ queryKey: ['slack-status', workspaceId] });
    }
  }, [slackResult, queryClient, workspaceId]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-lg font-semibold">Slack integration</h1>
      {slackResult === 'connected' && (
        <p className="text-sm text-green-700 dark:text-green-500">Slack connected successfully.</p>
      )}
      {slackResult === 'error' && (
        <p className="text-sm text-red-600">Could not connect Slack. Please try again.</p>
      )}
      <SlackConnectPanel workspaceId={workspaceId} />
    </div>
  );
}
