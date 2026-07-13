'use client';

import { useCrmStatusQuery, useCrmConnectMutation } from '@/lib/queries';

// KAN-71: the only entry today is HubSpot — adding a second provider
// later means adding one entry here, not redesigning this component or
// its layout.
const AVAILABLE_PROVIDERS: Array<{ id: string; label: string }> = [{ id: 'hubspot', label: 'HubSpot' }];

const PROVIDER_LABELS: Record<string, string> = {
  hubspot: 'HubSpot',
};

export function CrmConnectPanel({ workspaceId }: { workspaceId: string | null }): React.ReactElement {
  const { data: status, isLoading } = useCrmStatusQuery(workspaceId);
  const connect = useCrmConnectMutation(workspaceId);

  const handleConnect = (): void => {
    connect.mutate(undefined, {
      onSuccess: (data) => {
        window.location.href = data.authorizationUrl;
      },
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-black/60 dark:text-white/60">CRM connection</h2>
      {isLoading && <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>}

      {status?.connected && (
        <p className="text-sm">
          Connected to <strong>{PROVIDER_LABELS[status.provider ?? ''] ?? status.provider}</strong>
          {status.connectedAt && ` since ${new Date(status.connectedAt).toLocaleDateString()}`}.
        </p>
      )}

      {status && !status.connected && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-black/50 dark:text-white/50">No CRM connected yet.</p>
          <div className="flex gap-2">
            {AVAILABLE_PROVIDERS.map((provider) => (
              <button
                key={provider.id}
                type="button"
                onClick={handleConnect}
                disabled={connect.isPending}
                className="rounded-md border border-black/10 px-3 py-1 text-sm dark:border-white/15"
              >
                Connect {provider.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {connect.isError && <p className="text-sm text-red-600">Could not start the connection. Please try again.</p>}
    </div>
  );
}
