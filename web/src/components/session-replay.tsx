'use client';

import { useAuth } from '@/lib/auth-context';
import { useRespondMutation } from '@/lib/queries';
import { formatDuration } from '@/lib/format-duration';
import type { ConversationTurnDto, Lead } from '@/lib/types';

function TurnBubble({ turn }: { turn: ConversationTurnDto }): React.ReactElement {
  const isVisitor = turn.role === 'visitor';
  return (
    <div className={`flex flex-col gap-1 ${isVisitor ? 'items-start' : 'items-end'}`}>
      <div
        className={`max-w-md rounded-lg px-3 py-2 text-sm ${
          isVisitor
            ? 'bg-black/5 dark:bg-white/10'
            : 'bg-foreground text-background'
        }`}
      >
        {turn.content}
      </div>
      <span className="text-xs text-black/40 dark:text-white/40">
        {turn.role} · {new Date(turn.createdAt).toLocaleTimeString()}
      </span>
    </div>
  );
}

// KAN-59: minimal claim/dismiss trigger — no rep identity captured, by
// design (see decisions.md in gmleads-agents), first response wins
// server-side regardless of what's clicked here. 'booked' is never shown
// as a button — it's recorded automatically from the widget's own booking
// flow.
function ResponseActions({ session }: { session: Lead }): React.ReactElement | null {
  const { workspaceId } = useAuth();
  const respond = useRespondMutation(workspaceId);

  if (session.responseAction !== null) {
    return (
      <p className="text-sm text-black/60 dark:text-white/60">
        {session.responseTimeMs !== null
          ? `Responded (${session.responseAction}) after ${formatDuration(session.responseTimeMs)}`
          : `Responded: ${session.responseAction}`}
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={respond.isPending}
        onClick={() => respond.mutate({ sessionId: session.id, action: 'claimed' })}
        className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
      >
        Claim
      </button>
      <button
        type="button"
        disabled={respond.isPending}
        onClick={() => respond.mutate({ sessionId: session.id, action: 'dismissed' })}
        className="rounded-md border border-black/10 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-white/15"
      >
        Dismiss
      </button>
      {respond.isError && <p className="text-sm text-red-600">Could not record response.</p>}
    </div>
  );
}

export function SessionReplay({ session, turns }: { session: Lead; turns: ConversationTurnDto[] }): React.ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">{session.companyName ?? 'Unknown company'}</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Status: <span className="capitalize">{session.status}</span> · Score: {session.icpScore}
        </p>
      </div>

      {/* alertedAt is set once a session ever escalates, regardless of its
          current status (e.g. a booked session was alerted earlier) — that's
          the right gate for "was this session ever eligible for a response,"
          not the current status value. */}
      {session.alertedAt !== null && <ResponseActions session={session} />}

      {turns.length === 0 ? (
        <p className="text-sm text-black/50 dark:text-white/50">No messages in this session yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {turns.map((turn) => (
            <TurnBubble key={turn.id} turn={turn} />
          ))}
        </div>
      )}
    </div>
  );
}
