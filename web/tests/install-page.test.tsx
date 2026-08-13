import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUseAuth = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

import InstallPage from '@/app/leads/install/page';

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
      <InstallPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('InstallPage', () => {
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

  it('fetches the workspace profile scoped to the authenticated workspace and renders the embed key + snippet', async () => {
    mockUseAuth.mockReturnValue({
      accessToken: 'token',
      workspaceId: 'workspace-a',
      isInitializing: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    const fetchSpy = vi.fn().mockImplementation(() =>
      Promise.resolve(
        jsonResponse(200, { id: 'workspace-a', name: 'Gridflow', embedKey: 'gml_abc123' })
      )
    );
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();

    await waitFor(() => {
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:13000/api/workspaces/workspace-a');
    });
    expect(await screen.findByText('gml_abc123')).toBeInTheDocument();
    expect((await screen.findAllByText(/Gridflow/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/data-key="gml_abc123"/)).toBeInTheDocument();
  });

  it('shows an error rather than a silent blank panel when the fetch fails', async () => {
    mockUseAuth.mockReturnValue({
      accessToken: 'token',
      workspaceId: 'workspace-a',
      isInitializing: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    const fetchSpy = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(500, {})));
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();

    expect(await screen.findByText(/Could not load your embed key/)).toBeInTheDocument();
  });
});
