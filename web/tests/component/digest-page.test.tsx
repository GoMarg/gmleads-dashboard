import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUseAuth = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

import DigestPage from '@/app/leads/digest/page';

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
      <DigestPage />
    </QueryClientProvider>
  );
}

const DELIVERIES = [
  { id: 'del-1', workspaceId: 'workspace-a', sentAt: '2026-01-05T08:00:00Z', channel: 'slack', summary: {} },
];
const SCHEDULE = { dayOfWeek: 1, hourUtc: 8 };

function routeFetch(url: string): Response {
  if (url.includes('/analytics/digest-schedule')) return jsonResponse(200, SCHEDULE);
  if (url.includes('/analytics/digest-log')) return jsonResponse(200, DELIVERIES);
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

describe('DigestPage', () => {
  it('renders the delivery log and current schedule', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => Promise.resolve(routeFetch(url))));
    renderPage();

    expect(await screen.findByText('slack')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Monday')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('8')).toBeInTheDocument();
  });

  it('shows a placeholder when no digest has been sent yet', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/analytics/digest-schedule')) return Promise.resolve(jsonResponse(200, SCHEDULE));
        return Promise.resolve(jsonResponse(200, []));
      })
    );
    renderPage();
    expect(await screen.findByText('No digest sent yet.')).toBeInTheDocument();
  });

  it('saving the schedule PATCHes dayOfWeek/hourUtc', async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/analytics/digest-schedule') && init?.method === 'PATCH') {
        return Promise.resolve(jsonResponse(200, { dayOfWeek: 3, hourUtc: 14 }));
      }
      return Promise.resolve(routeFetch(url));
    });
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();
    await screen.findByDisplayValue('8');

    const user = userEvent.setup();
    const hourInput = screen.getByLabelText('Hour (UTC)');
    await user.clear(hourInput);
    await user.type(hourInput, '14');
    await user.click(screen.getByRole('button', { name: 'Save schedule' }));

    await waitFor(() => {
      const call = fetchSpy.mock.calls.find(
        ([url, init]) =>
          (url as string).includes('/analytics/digest-schedule') && (init as RequestInit)?.method === 'PATCH'
      );
      expect(call).toBeDefined();
      expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({
        dayOfWeek: 1,
        hourUtc: 14,
      });
    });
  });
});
