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
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toContain('/api/workspaces/workspace-a/leads');
  });

  it('refetches with the status filter applied when changed', async () => {
    mockUseAuth.mockReturnValue({
      accessToken: 'token',
      workspaceId: 'workspace-a',
      isInitializing: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(200, { leads: [] }));
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Status'), 'booked');

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    const [url] = fetchSpy.mock.calls[1] as [string];
    expect(url).toContain('status=booked');
  });
});
