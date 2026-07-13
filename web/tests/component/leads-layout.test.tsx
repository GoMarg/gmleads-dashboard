import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mockUseAuth = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

import LeadsLayout from '@/app/leads/layout';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// KAN-101's WidgetStatusIndicator (rendered in every LeadsLayout) calls
// useQuery, which requires a QueryClientProvider ancestor even when the
// query is `enabled: false` — every render call below needs this wrapper.
function renderLayout(children: React.ReactNode): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <LeadsLayout>{children}</LeadsLayout>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  mockReplace.mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(jsonResponse(200, { lastSeenAt: null }))
  );
});

describe('LeadsLayout (auth guard)', () => {
  it('redirects to /login when not authenticated', async () => {
    mockUseAuth.mockReturnValue({
      accessToken: null,
      workspaceId: null,
      isInitializing: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderLayout(<div>protected content</div>);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
  });

  it('does not redirect while the initial silent-refresh is still in flight', () => {
    mockUseAuth.mockReturnValue({
      accessToken: null,
      workspaceId: null,
      isInitializing: true,
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderLayout(<div>protected content</div>);

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
  });

  it('renders the protected content once authenticated', () => {
    mockUseAuth.mockReturnValue({
      accessToken: 'a-valid-token',
      workspaceId: 'workspace-a',
      isInitializing: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderLayout(<div>protected content</div>);

    expect(screen.getByText('protected content')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // KAN-58
  it('links to both /leads and /leads/funnel in the nav', () => {
    mockUseAuth.mockReturnValue({
      accessToken: 'a-valid-token',
      workspaceId: 'workspace-a',
      isInitializing: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderLayout(<div>protected content</div>);

    expect(screen.getByRole('link', { name: 'Leads' })).toHaveAttribute('href', '/leads');
    expect(screen.getByRole('link', { name: 'Funnel' })).toHaveAttribute('href', '/leads/funnel');
  });

  // KAN-66/67/68/69
  it('links to /leads/routing in the nav', () => {
    mockUseAuth.mockReturnValue({
      accessToken: 'a-valid-token',
      workspaceId: 'workspace-a',
      isInitializing: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderLayout(<div>protected content</div>);

    expect(screen.getByRole('link', { name: 'Routing' })).toHaveAttribute('href', '/leads/routing');
  });

  // KAN-71/72/73
  it('links to /leads/crm in the nav', () => {
    mockUseAuth.mockReturnValue({
      accessToken: 'a-valid-token',
      workspaceId: 'workspace-a',
      isInitializing: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderLayout(<div>protected content</div>);

    expect(screen.getByRole('link', { name: 'CRM' })).toHaveAttribute('href', '/leads/crm');
  });
});

describe('LeadsLayout header — widget status indicator (KAN-101)', () => {
  it('shows "Widget never seen" when lastSeenAt is null', async () => {
    mockUseAuth.mockReturnValue({
      accessToken: 'a-valid-token',
      workspaceId: 'workspace-a',
      isInitializing: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { lastSeenAt: null })));

    renderLayout(<div>protected content</div>);

    expect(await screen.findByText('Widget never seen')).toBeInTheDocument();
  });

  it('shows "Widget active — last seen X ago" when a session exists', async () => {
    mockUseAuth.mockReturnValue({
      accessToken: 'a-valid-token',
      workspaceId: 'workspace-a',
      isInitializing: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { lastSeenAt: twoHoursAgo }))
    );

    renderLayout(<div>protected content</div>);

    expect(await screen.findByText('Widget active — last seen 2h ago')).toBeInTheDocument();
  });

  it('shows minutes-ago phrasing for a very recent session', async () => {
    mockUseAuth.mockReturnValue({
      accessToken: 'a-valid-token',
      workspaceId: 'workspace-a',
      isInitializing: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { lastSeenAt: fiveMinutesAgo }))
    );

    renderLayout(<div>protected content</div>);

    expect(await screen.findByText('Widget active — last seen 5m ago')).toBeInTheDocument();
  });

  it('shows days-ago phrasing for a session older than 24 hours', async () => {
    mockUseAuth.mockReturnValue({
      accessToken: 'a-valid-token',
      workspaceId: 'workspace-a',
      isInitializing: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { lastSeenAt: threeDaysAgo }))
    );

    renderLayout(<div>protected content</div>);

    expect(await screen.findByText('Widget active — last seen 3d ago')).toBeInTheDocument();
  });

  it('shows "just now" phrasing for a session seen within the last minute', async () => {
    mockUseAuth.mockReturnValue({
      accessToken: 'a-valid-token',
      workspaceId: 'workspace-a',
      isInitializing: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    const justNow = new Date(Date.now() - 10 * 1000).toISOString();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { lastSeenAt: justNow })));

    renderLayout(<div>protected content</div>);

    expect(await screen.findByText('Widget active — last seen just now')).toBeInTheDocument();
  });

  it('does not fetch widget status until workspaceId is known', () => {
    mockUseAuth.mockReturnValue({
      accessToken: null,
      workspaceId: null,
      isInitializing: true,
      login: vi.fn(),
      logout: vi.fn(),
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    renderLayout(<div>protected content</div>);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
