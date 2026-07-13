import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUseAuth = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

import DarkFunnelPage from '@/app/leads/dark-funnel/page';

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
      <DarkFunnelPage />
    </QueryClientProvider>
  );
}

const ACCOUNTS = [
  {
    id: 'd-1',
    workspaceId: 'workspace-a',
    matchKey: 'acme.com',
    firstQualifiedAt: '2026-01-01T00:00:00Z',
    lastActivityAt: '2026-01-05T00:00:00Z',
    visitCount: 4,
  },
];
const SETTINGS = { visitThresholdCount: 3, windowDays: 14 };

function routeFetch(url: string): Response {
  if (url.includes('/analytics/dark-funnel-settings')) return jsonResponse(200, SETTINGS);
  if (url.includes('/analytics/dark-funnel')) return jsonResponse(200, ACCOUNTS);
  return jsonResponse(404, { error: 'unexpected_url' });
}

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

describe('DarkFunnelPage', () => {
  it('renders dark-funnel accounts and current settings', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => Promise.resolve(routeFetch(url))));
    renderPage();

    expect(await screen.findByText('acme.com')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('3')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('14')).toBeInTheDocument();
  });

  it('shows a placeholder when there are no dark-funnel accounts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/analytics/dark-funnel-settings')) return Promise.resolve(jsonResponse(200, SETTINGS));
        return Promise.resolve(jsonResponse(200, []));
      })
    );
    renderPage();
    expect(await screen.findByText(/No dark-funnel accounts right now/)).toBeInTheDocument();
  });

  it('saving settings PATCHes visitThresholdCount/windowDays only', async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/analytics/dark-funnel-settings') && init?.method === 'PATCH') {
        return Promise.resolve(jsonResponse(200, { visitThresholdCount: 5, windowDays: 30 }));
      }
      return Promise.resolve(routeFetch(url));
    });
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();
    await screen.findByDisplayValue('3');

    const user = userEvent.setup();
    const thresholdInput = screen.getByLabelText('Visit threshold');
    await user.clear(thresholdInput);
    await user.type(thresholdInput, '5');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => {
      const call = fetchSpy.mock.calls.find(
        ([url, init]) =>
          (url as string).includes('/analytics/dark-funnel-settings') &&
          (init as RequestInit)?.method === 'PATCH'
      );
      expect(call).toBeDefined();
      expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({
        visitThresholdCount: 5,
        windowDays: 14,
      });
    });
  });
});
