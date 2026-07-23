import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionReplay } from '@/components/session-replay';
import type { Lead, ConversationTurnDto } from '@/lib/types';

const mockUseAuth = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const baseSession: Lead = {
  id: 'session-1',
  workspaceId: 'ws-1',
  visitorIpHash: 'hash',
  pageUrl: 'https://example.com/pricing',
  companyName: 'Acme Corp',
  firmographics: null,
  icpScore: 82,
  status: 'alerted',
  alertedAt: '2026-07-09T09:58:00.000Z',
  pagesViewed: 2,
  isReturning: false,
  createdAt: '2026-07-09T10:00:00.000Z',
  snoozedUntil: null,
  responseAction: null,
  responseTimeMs: null,
};

function renderSessionReplay(session: Lead, turns: ConversationTurnDto[] = []): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <SessionReplay session={session} turns={turns} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  mockUseAuth.mockReturnValue({ workspaceId: 'ws-1' });
});

describe('SessionReplay', () => {
  it('renders the company name, status, and score', () => {
    renderSessionReplay(baseSession);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText(/alerted/i)).toBeInTheDocument();
    expect(screen.getByText(/82/)).toBeInTheDocument();
  });

  it('shows an empty state with no turns', () => {
    renderSessionReplay(baseSession);
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
    renderSessionReplay(baseSession, turns);
    expect(screen.getByText('Hi, interested in pricing')).toBeInTheDocument();
  });

  it('does not show claim/dismiss buttons for a session that was never alerted (KAN-59)', () => {
    renderSessionReplay({ ...baseSession, status: 'active', alertedAt: null });
    expect(screen.queryByRole('button', { name: 'Claim' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  });

  it('shows claim/dismiss buttons for an alerted session with no response yet (KAN-59)', () => {
    renderSessionReplay(baseSession);
    expect(screen.getByRole('button', { name: 'Claim' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });

  it('shows the recorded response instead of buttons once responded (KAN-59)', () => {
    renderSessionReplay({ ...baseSession, responseAction: 'claimed', responseTimeMs: 125_000 });
    expect(screen.getByText(/responded \(claimed\) after 2m 5s/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Claim' })).not.toBeInTheDocument();
  });

  it('shows the booked response for a booked session (auto-recorded, no buttons ever shown for it)', () => {
    renderSessionReplay({
      ...baseSession,
      status: 'booked',
      responseAction: 'booked',
      responseTimeMs: 60_000,
    });
    expect(screen.getByText(/responded \(booked\) after 1m/i)).toBeInTheDocument();
  });

  it('clicking Claim calls the respond endpoint and shows the response afterward', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, { action: 'claimed', respondedAt: '2026-07-09T10:02:00.000Z' })
      )
    );
    renderSessionReplay(baseSession);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Claim' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/workspaces/ws-1/sessions/session-1/respond'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('shows an error message if the respond call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, { error: 'internal' })));
    renderSessionReplay(baseSession);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(await screen.findByText('Could not record response.')).toBeInTheDocument();
  });

  // KAN-52
  it('shows a Snooze button alongside Claim/Dismiss for an unresponded, unsnoozed session', () => {
    renderSessionReplay(baseSession);
    expect(screen.getByRole('button', { name: 'Snooze 1h' })).toBeInTheDocument();
  });

  it('shows "Snoozed until" instead of action buttons while snoozed', () => {
    renderSessionReplay({ ...baseSession, snoozedUntil: '2099-01-01T00:00:00.000Z' });
    expect(screen.getByText(/snoozed until/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Claim' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Snooze 1h' })).not.toBeInTheDocument();
  });

  it('shows action buttons again once a past snoozedUntil has elapsed', () => {
    renderSessionReplay({ ...baseSession, snoozedUntil: '2020-01-01T00:00:00.000Z' });
    expect(screen.getByRole('button', { name: 'Claim' })).toBeInTheDocument();
    expect(screen.queryByText(/snoozed until/i)).not.toBeInTheDocument();
  });

  it('clicking Snooze 1h calls the snooze endpoint with minutes: 60', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { snoozedUntil: '2026-07-09T11:00:00.000Z' }))
    );
    renderSessionReplay(baseSession);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Snooze 1h' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/workspaces/ws-1/sessions/session-1/snooze'),
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ minutes: 60 }) })
      );
    });
  });

  it('shows an error message if the snooze call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, { error: 'internal' })));
    renderSessionReplay(baseSession);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Snooze 1h' }));

    expect(await screen.findByText('Could not snooze.')).toBeInTheDocument();
  });
});
