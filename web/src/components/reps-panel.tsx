'use client';

import { useState } from 'react';
import { useRepsQuery, useCreateRepMutation, useUpdateRepMutation } from '@/lib/queries';

// KAN-66: rep management — add a rep (name, email, optional Slack member
// ID so direct routing can @mention them without Slack OAuth) and toggle
// active/inactive. No hard delete in the UI, matching the backend (a
// deactivated rep's history stays intact for the audit log).
export function RepsPanel({ workspaceId }: { workspaceId: string | null }): React.ReactElement {
  const { data: reps, isLoading } = useRepsQuery(workspaceId);
  const createRep = useCreateRepMutation(workspaceId);
  const updateRep = useUpdateRepMutation(workspaceId);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [slackMemberId, setSlackMemberId] = useState('');

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!name || !email) return;
    createRep.mutate(
      { name, email, slackMemberId: slackMemberId || null },
      {
        onSuccess: () => {
          setName('');
          setEmail('');
          setSlackMemberId('');
        },
      }
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-black/60 dark:text-white/60">Reps</h2>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/15"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/15"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Slack member ID (optional)
          <input
            value={slackMemberId}
            onChange={(e) => setSlackMemberId(e.target.value)}
            placeholder="U0123ABC"
            className="rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/15"
          />
        </label>
        <button
          type="submit"
          disabled={createRep.isPending}
          className="rounded-md border border-black/10 px-3 py-1 text-sm dark:border-white/15"
        >
          Add rep
        </button>
      </form>
      {createRep.isError && <p className="text-sm text-red-600">Could not add rep.</p>}

      {isLoading && <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>}
      {reps && reps.length === 0 && (
        <p className="text-sm text-black/50 dark:text-white/50">
          No reps yet — leads route to the default channel until at least one is added.
        </p>
      )}
      {reps && reps.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-black/50 dark:text-white/50">
              <th className="py-1">Name</th>
              <th className="py-1">Email</th>
              <th className="py-1">Slack ID</th>
              <th className="py-1">Status</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {reps.map((rep) => (
              <tr key={rep.id} className="border-t border-black/10 dark:border-white/15">
                <td className="py-1">{rep.name}</td>
                <td className="py-1">{rep.email}</td>
                <td className="py-1">{rep.slackMemberId ?? '—'}</td>
                <td className="py-1">{rep.active ? 'Active' : 'Inactive'}</td>
                <td className="py-1">
                  <button
                    type="button"
                    onClick={() => updateRep.mutate({ repId: rep.id, active: !rep.active })}
                    className="text-xs text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white"
                  >
                    {rep.active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
