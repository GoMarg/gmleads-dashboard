'use client';

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

export function SessionReplay({ session, turns }: { session: Lead; turns: ConversationTurnDto[] }): React.ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">{session.companyName ?? 'Unknown company'}</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Status: <span className="capitalize">{session.status}</span> · Score: {session.icpScore}
        </p>
      </div>

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
