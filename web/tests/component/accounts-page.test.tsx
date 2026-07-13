import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUseAuth = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

import AccountScoresPage from '@/app/leads/accounts/page';

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
      <AccountScoresPage />
    </QueryClientProvider>
  );
}

const SCORES = [
  {
    id: 's-1',
    workspaceId: 'workspace-a',
    matchKey: 'acme.com',
    score: 72,
    factors: { firmographicFit: 100, visitFrequency: 40, engagementDepth: 50, intentSignals: 25 },
    algorithmVersion: 'v1',
    computedAt: '2026-01-05T02:00:00Z',
  },
];

beforeEach(() => {
  vi.restoreAllMocks();
  mockUseAuth.mockReturnValue({
    accessToken: 'token',
    workspaceId: 'workspace-a',
    isInitializing: false,
    login: vi.fn(),
    logout: vi.fn(),
  });
});

describe('AccountScoresPage', () => {
  it('renders current scores with a factor breakdown', async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes('/analytics/account-scores')) return Promise.resolve(jsonResponse(200, SCORES));
      return Promise.resolve(jsonResponse(404, { error: 'unexpected_url' }));
    });
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();

    expect(await screen.findByText('acme.com')).toBeInTheDocument();
    expect(screen.getByText('72')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument(); // firmographicFit
  });

  it('shows a placeholder when there are no scored accounts yet', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, [])));
    renderPage();
    expect(await screen.findByText(/No scored accounts yet/)).toBeInTheDocument();
  });

  it('clicking "Recompute now" POSTs to the recompute endpoint', async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if ((url as string).includes('/analytics/recompute') && init?.method === 'POST') {
        return Promise.resolve(jsonResponse(200, { scoredCount: 1, darkFunnelCount: 0 }));
      }
      if ((url as string).includes('/analytics/account-scores')) return Promise.resolve(jsonResponse(200, SCORES));
      return Promise.resolve(jsonResponse(404, { error: 'unexpected_url' }));
    });
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();
    await screen.findByText('acme.com');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Recompute now' }));

    await waitFor(() => {
      const call = fetchSpy.mock.calls.find(
        ([url, init]) => (url as string).includes('/analytics/recompute') && (init as RequestInit)?.method === 'POST'
      );
      expect(call).toBeDefined();
    });
  });
});
