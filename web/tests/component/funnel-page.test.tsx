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

// Three queries fire from this page (funnel, delivery-stats,
// identification-accuracy) — route each explicitly rather than a two-way
// branch, since a two-way branch silently misroutes the third call into
// whichever "else" case happens to match first.
function routeFetch(url: string): Response {
  if (url.includes('analytics/funnel')) {
    return jsonResponse(200, { visitorCount: 0, qualifiedCount: 0, bookedCount: 0 });
  }
  if (url.includes('delivery-stats')) {
    return jsonResponse(200, { p50Ms: null, p95Ms: null, successCount: 0, failureCount: 0 });
  }
  return jsonResponse(200, {
    resolvedCount: 0,
    unknownCount: 0,
    failedCount: 0,
    lowConfidenceCount: 0,
  });
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

  it('fetches funnel, delivery, and identification-accuracy stats scoped to the authenticated workspace', async () => {
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
          : url.includes('delivery-stats')
            ? jsonResponse(200, { p50Ms: 250, p95Ms: 1500, successCount: 38, failureCount: 2 })
            : jsonResponse(200, {
                resolvedCount: 30,
                unknownCount: 5,
                failedCount: 2,
                lowConfidenceCount: 3,
              })
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
    await waitFor(() => {
      const identCall = fetchSpy.mock.calls.find(([url]) =>
        (url as string).includes('identification-accuracy')
      );
      expect(identCall?.[0]).toContain(
        '/api/workspaces/workspace-a/analytics/identification-accuracy'
      );
    });

    // Counts render twice each (stat tile + funnel bar row), so assert
    // presence via getAllByText rather than the single-match findByText.
    await waitFor(() => expect(screen.getAllByText('100').length).toBeGreaterThan(0)); // visitors
    expect(screen.getAllByText('40').length).toBeGreaterThan(0); // qualified
    expect(screen.getAllByText('10').length).toBeGreaterThan(0); // booked
    expect(await screen.findByText('250ms')).toBeInTheDocument(); // p50, sub-second branch
    expect(await screen.findByText('1.5s')).toBeInTheDocument(); // p95, >=1s branch
    expect(await screen.findByText('30')).toBeInTheDocument(); // resolved
    expect(await screen.findByText('5')).toBeInTheDocument(); // unknown
    expect(await screen.findByText('2')).toBeInTheDocument(); // failed
    expect(await screen.findByText('3')).toBeInTheDocument(); // low confidence
  });

  it('one shared range selector drives all three analytics requests', async () => {
    mockUseAuth.mockReturnValue({
      accessToken: 'token',
      workspaceId: 'workspace-a',
      isInitializing: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    const fetchSpy = vi.fn().mockImplementation((url: string) => Promise.resolve(routeFetch(url)));
    vi.stubGlobal('fetch', fetchSpy);
    const callsFor = (fragment: string): string[] =>
      fetchSpy.mock.calls.map(([url]) => url as string).filter((url) => url.includes(fragment));

    renderPage();
    await waitFor(() => expect(callsFor('analytics/funnel')).toHaveLength(1));
    await waitFor(() => expect(callsFor('delivery-stats')).toHaveLength(1));
    await waitFor(() => expect(callsFor('identification-accuracy')).toHaveLength(1));

    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox'), '30d');

    await waitFor(() => expect(callsFor('analytics/funnel')).toHaveLength(2));
    await waitFor(() => expect(callsFor('delivery-stats')).toHaveLength(2));
    await waitFor(() => expect(callsFor('identification-accuracy')).toHaveLength(2));
    // All three refetches carry the same `from` bound — one selector, one window.
    const fromFor = (fragment: string): string | null =>
      new URL(callsFor(fragment)[1]!, 'http://localhost').searchParams.get('from');
    const funnelFrom = fromFor('analytics/funnel');
    expect(fromFor('delivery-stats')).toBe(funnelFrom);
    expect(fromFor('identification-accuracy')).toBe(funnelFrom);
  });

  it('shows an error message if any request fails', async () => {
    mockUseAuth.mockReturnValue({
      accessToken: 'token',
      workspaceId: 'workspace-a',
      isInitializing: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    const fetchSpy = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('analytics/funnel') ? jsonResponse(500, { error: 'internal' }) : routeFetch(url)
      )
    );
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();

    expect(await screen.findByText('Could not load analytics. Please try again.')).toBeInTheDocument();
  });
});
