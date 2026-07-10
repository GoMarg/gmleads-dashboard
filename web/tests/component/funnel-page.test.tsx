import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUseAuth = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

import FunnelPage from '@/app/leads/funnel/page';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderPage(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <FunnelPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('FunnelPage', () => {
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

  it('fetches funnel and delivery stats scoped to the authenticated workspace', async () => {
    mockUseAuth.mockReturnValue({
      accessToken: 'token',
      workspaceId: 'workspace-a',
      isInitializing: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    const fetchSpy = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('analytics/funnel')
          ? jsonResponse(200, { visitorCount: 100, qualifiedCount: 40, bookedCount: 10 })
          : jsonResponse(200, { p50Ms: 250, p95Ms: 1500, successCount: 38, failureCount: 2 })
      )
    );
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();

    await waitFor(() => {
      const funnelCall = fetchSpy.mock.calls.find(([url]) => (url as string).includes('analytics/funnel'));
      expect(funnelCall?.[0]).toContain('/api/workspaces/workspace-a/analytics/funnel');
    });
    await waitFor(() => {
      const deliveryCall = fetchSpy.mock.calls.find(([url]) =>
        (url as string).includes('delivery-stats')
      );
      expect(deliveryCall?.[0]).toContain('/api/workspaces/workspace-a/alerts/delivery-stats');
    });

    // Counts render twice each (stat tile + funnel bar row), so assert
    // presence via getAllByText rather than the single-match findByText.
    await waitFor(() => expect(screen.getAllByText('100').length).toBeGreaterThan(0)); // visitors
    expect(screen.getAllByText('40').length).toBeGreaterThan(0); // qualified
    expect(screen.getAllByText('10').length).toBeGreaterThan(0); // booked
    expect(await screen.findByText('250ms')).toBeInTheDocument(); // p50, sub-second branch
    expect(await screen.findByText('1.5s')).toBeInTheDocument(); // p95, >=1s branch
  });

  it('one shared range selector drives both the funnel and delivery-stats requests', async () => {
    mockUseAuth.mockReturnValue({
      accessToken: 'token',
      workspaceId: 'workspace-a',
      isInitializing: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    const fetchSpy = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('analytics/funnel')
          ? jsonResponse(200, { visitorCount: 0, qualifiedCount: 0, bookedCount: 0 })
          : jsonResponse(200, { p50Ms: null, p95Ms: null, successCount: 0, failureCount: 0 })
      )
    );
    vi.stubGlobal('fetch', fetchSpy);
    const callsFor = (fragment: string): string[] =>
      fetchSpy.mock.calls.map(([url]) => url as string).filter((url) => url.includes(fragment));

    renderPage();
    await waitFor(() => expect(callsFor('analytics/funnel')).toHaveLength(1));
    await waitFor(() => expect(callsFor('delivery-stats')).toHaveLength(1));

    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox'), '30d');

    await waitFor(() => expect(callsFor('analytics/funnel')).toHaveLength(2));
    await waitFor(() => expect(callsFor('delivery-stats')).toHaveLength(2));
    // Both refetches carry the same `from` bound — one selector, one window.
    const funnelFrom = new URL(callsFor('analytics/funnel')[1]!, 'http://localhost').searchParams.get(
      'from'
    );
    const deliveryFrom = new URL(
      callsFor('delivery-stats')[1]!,
      'http://localhost'
    ).searchParams.get('from');
    expect(funnelFrom).toBe(deliveryFrom);
  });

  it('shows an error message if either request fails', async () => {
    mockUseAuth.mockReturnValue({
      accessToken: 'token',
      workspaceId: 'workspace-a',
      isInitializing: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    const fetchSpy = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('analytics/funnel')
          ? jsonResponse(500, { error: 'internal' })
          : jsonResponse(200, { p50Ms: null, p95Ms: null, successCount: 0, failureCount: 0 })
      )
    );
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();

    expect(await screen.findByText('Could not load analytics. Please try again.')).toBeInTheDocument();
  });
});
