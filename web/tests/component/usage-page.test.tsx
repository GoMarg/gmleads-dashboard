import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUseAuth = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

import UsagePage from '@/app/leads/usage/page';

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
      <UsagePage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('UsagePage', () => {
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

  it('fetches usage scoped to the authenticated workspace and renders it', async () => {
    mockUseAuth.mockReturnValue({
      accessToken: 'token',
      workspaceId: 'workspace-a',
      isInitializing: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    const fetchSpy = vi.fn().mockImplementation(() =>
      Promise.resolve(
        jsonResponse(200, {
          periodStart: '2026-07-01T00:00:00.000Z',
          periodEnd: '2026-08-01T00:00:00.000Z',
          sessionsUsed: 120,
          sessionsQuota: 1000,
          enrichmentLookupsUsed: 80,
          enrichmentLookupsQuota: 1000,
        })
      )
    );
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();

    await waitFor(() => {
      expect(fetchSpy.mock.calls[0]?.[0]).toContain('/api/workspaces/workspace-a/usage');
    });
    expect(await screen.findByText('Sessions')).toBeInTheDocument();
    expect(await screen.findByText(/120 of 1,000 used/)).toBeInTheDocument();
    expect(await screen.findByText('Enrichment lookups')).toBeInTheDocument();
    expect(await screen.findByText(/80 of 1,000 used/)).toBeInTheDocument();
  });

  it('flags an over-quota workspace', async () => {
    mockUseAuth.mockReturnValue({
      accessToken: 'token',
      workspaceId: 'workspace-a',
      isInitializing: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    const fetchSpy = vi.fn().mockImplementation(() =>
      Promise.resolve(
        jsonResponse(200, {
          periodStart: '2026-07-01T00:00:00.000Z',
          periodEnd: '2026-08-01T00:00:00.000Z',
          sessionsUsed: 1200,
          sessionsQuota: 1000,
          enrichmentLookupsUsed: 500,
          enrichmentLookupsQuota: 1000,
        })
      )
    );
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();

    expect(await screen.findByText(/over quota/)).toBeInTheDocument();
  });
});
