import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionReplay } from '@/components/session-replay';
import type { Lead, ConversationTurnDto } from '@/lib/types';

const session: Lead = {
  id: 'session-1',
  workspaceId: 'ws-1',
  visitorIpHash: 'hash',
  pageUrl: 'https://example.com/pricing',
  companyName: 'Acme Corp',
  firmographics: null,
  icpScore: 82,
  status: 'alerted',
  alertedAt: null,
  pagesViewed: 2,
  isReturning: false,
  createdAt: '2026-07-09T10:00:00.000Z',
};

describe('SessionReplay', () => {
  it('renders the company name, status, and score', () => {
    render(<SessionReplay session={session} turns={[]} />);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText(/alerted/i)).toBeInTheDocument();
    expect(screen.getByText(/82/)).toBeInTheDocument();
  });

  it('shows an empty state with no turns', () => {
    render(<SessionReplay session={session} turns={[]} />);
    expect(screen.getByText('No messages in this session yet.')).toBeInTheDocument();
  });

  it('renders each conversation turn', () => {
    const turns: ConversationTurnDto[] = [
      {
        id: 't1',
        sessionId: 'session-1',
        role: 'visitor',
        content: 'Hi, interested in pricing',
        icpScoreAtTurn: null,
        intentStage: null,
        createdAt: '2026-07-09T10:01:00.000Z',
      },
    ];
    render(<SessionReplay session={session} turns={turns} />);
    expect(screen.getByText('Hi, interested in pricing')).toBeInTheDocument();
  });
});
