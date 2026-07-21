import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// KAN-100 AC3 / KAN-99's tenant isolation: this suite verifies the UI's
// reaction to the gateway's 403 (cross-workspace token) and 404 (session
// belongs to another workspace, per gmleads-dashboard's leads.repo.ts) —
// never a blank page, a crash, or a flash of another workspace's data.

vi.mock('next/navigation', () => ({
  useParams: () => ({ sessionId: 'session-belonging-to-another-workspace' }),
}));

const mockUseAuth = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

import SessionReplayPage from '@/app/leads/[sessionId]/page';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function renderPage(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <SessionReplayPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  mockUseAuth.mockReturnValue({
    accessToken: 'a-valid-access-token-for-workspace-a',
    workspaceId: 'workspace-a',
    isInitializing: false,
    login: vi.fn(),
    logout: vi.fn(),
  });
});

describe('session replay — tenant isolation', () => {
  it('renders a clear "not part of your workspace" message on a 403, never the raw error or a blank page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(403, { error: 'forbidden' })));

    renderPage();

    expect(
      await screen.findByText("This session doesn't exist or isn't part of your workspace.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/forbidden/i)).not.toBeInTheDocument();
  });

  it('renders the same message on a 404 (session belongs to a different workspace)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(404, { error: 'not_found' })));

    renderPage();

    expect(
      await screen.findByText("This session doesn't exist or isn't part of your workspace.")
    ).toBeInTheDocument();
  });

  it('never renders session content when the request is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(403, { error: 'forbidden' })));

    renderPage();

    await screen.findByText("This session doesn't exist or isn't part of your workspace.");
    expect(screen.queryByText(/score:/i)).not.toBeInTheDocument();
  });

  it('requests the session using only the authenticated workspaceId, never one from the URL', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(403, { error: 'forbidden' }));
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();

    await screen.findByText("This session doesn't exist or isn't part of your workspace.");
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toContain('/api/workspaces/workspace-a/sessions/session-belonging-to-another-workspace');
  });
});
