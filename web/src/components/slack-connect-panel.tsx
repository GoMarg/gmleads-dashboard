'use client';

import { useState } from 'react';
import {
  useSlackStatusQuery,
  useSlackConnectMutation,
  useSlackChannelsQuery,
  useSetSlackChannelMutation,
  useSlackDisconnectMutation,
} from '@/lib/queries';

export function SlackConnectPanel({ workspaceId }: { workspaceId: string | null }): React.ReactElement {
  const { data: status, isLoading } = useSlackStatusQuery(workspaceId);
  const connect = useSlackConnectMutation(workspaceId);
  const disconnect = useSlackDisconnectMutation(workspaceId);
  const setChannel = useSetSlackChannelMutation(workspaceId);
  const [pickingChannel, setPickingChannel] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState('');

  // Only fetched once connected (and only while the picker is open) —
  // listing channels for a workspace with no connection 409s.
  const showPicker = pickingChannel || Boolean(status?.connected && !status.defaultChannelName);
  const { data: channels, isLoading: channelsLoading } = useSlackChannelsQuery(
    workspaceId,
    Boolean(status?.connected) && showPicker
  );

  const handleConnect = (): void => {
    connect.mutate(undefined, {
      onSuccess: (data) => {
        window.location.href = data.authorizationUrl;
      },
    });
  };

  const handleSaveChannel = (): void => {
    const channel = channels?.find((c) => c.id === selectedChannelId);
    if (!channel) return;
    setChannel.mutate(
      { channelId: channel.id, channelName: channel.name },
      { onSuccess: () => setPickingChannel(false) }
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-black/60 dark:text-white/60">Slack connection</h2>
      {isLoading && <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>}

      {status && !status.connected && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-black/50 dark:text-white/50">No Slack workspace connected yet.</p>
          <button
            type="button"
            onClick={handleConnect}
            disabled={connect.isPending}
            className="self-start rounded-md border border-black/10 px-3 py-1 text-sm dark:border-white/15"
          >
            Connect Slack
          </button>
        </div>
      )}

      {status?.connected && (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            Connected to <strong>{status.teamName}</strong>
            {status.connectedAt && ` since ${new Date(status.connectedAt).toLocaleDateString()}`}.
          </p>

          {status.defaultChannelName && !showPicker && (
            <p className="text-sm text-black/50 dark:text-white/50">
              Posting alerts to <strong>#{status.defaultChannelName}</strong>.{' '}
              <button
                type="button"
                onClick={() => setPickingChannel(true)}
                className="underline underline-offset-2"
              >
                Change channel
              </button>
            </p>
          )}

          {showPicker && (
            <div className="flex items-center gap-2">
              {channelsLoading && <p className="text-sm text-black/50 dark:text-white/50">Loading channels…</p>}
              {channels && (
                <>
                  <select
                    aria-label="Slack channel"
                    value={selectedChannelId}
                    onChange={(e) => setSelectedChannelId(e.target.value)}
                    className="rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/15"
                  >
                    <option value="">Select a channel…</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>
                        #{c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleSaveChannel}
                    disabled={!selectedChannelId || setChannel.isPending}
                    className="rounded-md border border-black/10 px-3 py-1 text-sm dark:border-white/15"
                  >
                    Save channel
                  </button>
                </>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => disconnect.mutate()}
            disabled={disconnect.isPending}
            className="self-start text-sm text-red-600 underline underline-offset-2"
          >
            Disconnect
          </button>
        </div>
      )}

      {connect.isError && <p className="text-sm text-red-600">Could not start the connection. Please try again.</p>}
      {setChannel.isError && <p className="text-sm text-red-600">Could not save the channel. Please try again.</p>}
      {disconnect.isError && <p className="text-sm text-red-600">Could not disconnect. Please try again.</p>}
    </div>
  );
}
