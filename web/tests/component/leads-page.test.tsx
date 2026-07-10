import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUseAuth = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

import LeadsPage from '@/app/leads/page';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function renderPage(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <LeadsPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('LeadsPage', () => {
  it('does not call the API at all until workspaceId is known', () => {
    mockUseAuth.mockReturnValue({
      accessToken: null,
      workspaceId: null,
      isInitializing: true,
      login: vi.fn(),
      logout: vi.fn(),
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('lists leads scoped to the authenticated workspace', async () => {
    mockUseAuth.mockReturnValue({
      accessToken: 'token',
      workspaceId: 'workspace-a',
      isInitializing: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    const fetchSpy = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        leads: [
          {
            id: 'lead-1',
            workspaceId: 'workspace-a',
            companyName: 'Acme Corp',
            status: 'alerted',
            icpScore: 82,
            createdAt: '2026-07-09T10:00:00.000Z',
          },
        ],
      })
    );
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();

    expect(await screen.findByText('Acme Corp')).toBeInTheDocument();
    const leadsCall = fetchSpy.mock.calls.find(([url]) => (url as string).includes('/leads'));
    expect(leadsCall?.[0]).toContain('/api/workspaces/workspace-a/leads');
  });

  it('refetches with the status filter applied when changed', async () => {
    mockUseAuth.mockReturnValue({
      accessToken: 'token',
      workspaceId: 'workspace-a',
      isInitializing: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    // The page also fires a response-stats request (KAN-59) alongside the
    // leads request — filter calls to isolate just the leads fetches.
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(200, { leads: [] }));
    vi.stubGlobal('fetch', fetchSpy);
    const leadsCalls = (): string[] =>
      fetchSpy.mock.calls.map(([url]) => url as string).filter((url) => url.includes('/leads'));

    renderPage();
    await waitFor(() => expect(leadsCalls()).toHaveLength(1));

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Status'), 'booked');

    await waitFor(() => expect(leadsCalls()).toHaveLength(2));
    expect(leadsCalls()[1]).toContain('status=booked');
  });

  it('fetches response-time stats scoped to the authenticated workspace (KAN-59)', async () => {
    mockUseAuth.mockReturnValue({
      accessToken: 'token',
      workspaceId: 'workspace-a',
      isInitializing: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    const fetchSpy = vi.fn().mockImplementation((url: string) =>
      url.includes('response-stats')
        ? Promise.resolve(
            jsonResponse(200, { avgMs: 60000, medianMs: 45000, respondedCount: 3, noResponseCount: 1 })
          )
        : Promise.resolve(jsonResponse(200, { leads: [] }))
    );
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();

    expect(await screen.findByText('1m')).toBeInTheDocument(); // avg
    expect(screen.getByText('45s')).toBeInTheDocument(); // median
    const statsCall = fetchSpy.mock.calls.find(([url]) => (url as string).includes('response-stats'));
    expect(statsCall?.[0]).toContain('/api/workspaces/workspace-a/alerts/response-stats');
  });
});
