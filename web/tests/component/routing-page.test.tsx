import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUseAuth = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

import RoutingPage from '@/app/leads/routing/page';

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
      <RoutingPage />
    </QueryClientProvider>
  );
}

const REPS = [
  { id: 'rep-1', workspaceId: 'workspace-a', name: 'Jamie', email: 'jamie@acme.test', slackMemberId: 'U1', active: true, createdAt: '2026-01-01T00:00:00Z' },
];

function routeFetch(url: string): Response {
  // Checked before the generic '/reps' match below — '/reps/presence'
  // contains '/reps' as a substring.
  if (url.includes('/reps/presence')) return jsonResponse(200, []);
  if (url.includes('/reps')) return jsonResponse(200, REPS);
  if (url.includes('/accounts')) {
    return jsonResponse(200, [
      { id: 'a-1', workspaceId: 'workspace-a', matchType: 'domain', matchKey: 'acme.com', repId: 'rep-1', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    ]);
  }
  if (url.includes('/routing/audit')) {
    return jsonResponse(200, [
      { id: 'e-1', workspaceId: 'workspace-a', sessionId: 'session-12345678', method: 'direct', matchedKey: 'acme.com', repId: 'rep-1', createdAt: '2026-01-02T00:00:00Z' },
    ]);
  }
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

describe('RoutingPage', () => {
  it('renders reps, mapped accounts, and the audit log, scoped to the authenticated workspace', async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => Promise.resolve(routeFetch(url)));
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();

    expect(await screen.findByText('jamie@acme.test')).toBeInTheDocument();
    expect(screen.getAllByText('Jamie').length).toBeGreaterThan(0); // reps table + audit "Routed to"
    expect(await screen.findByText('Account list (1 mapped)')).toBeInTheDocument();
    expect(await screen.findByText('Direct match')).toBeInTheDocument();
    expect(screen.getByText('acme.com')).toBeInTheDocument();

    await waitFor(() => {
      const repsCall = fetchSpy.mock.calls.find(([url]) => (url as string).includes('/reps'));
      expect(repsCall?.[0]).toContain('/api/workspaces/workspace-a/reps');
    });
  });

  it('submitting the add-rep form POSTs to /reps and clears the form on success', async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/reps') && init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse(201, {
            id: 'rep-2',
            workspaceId: 'workspace-a',
            name: 'New Rep',
            email: 'new@acme.test',
            slackMemberId: null,
            active: true,
            createdAt: '2026-01-03T00:00:00Z',
          })
        );
      }
      return Promise.resolve(routeFetch(url));
    });
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();
    await screen.findByText('jamie@acme.test');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Name'), 'New Rep');
    await user.type(screen.getByLabelText('Email'), 'new@acme.test');
    await user.click(screen.getByRole('button', { name: 'Add rep' }));

    await waitFor(() => {
      const postCall = fetchSpy.mock.calls.find(
        ([url, init]) => (url as string).includes('/reps') && (init as RequestInit)?.method === 'POST'
      );
      expect(postCall).toBeDefined();
      expect(JSON.parse((postCall![1] as RequestInit).body as string)).toEqual({
        name: 'New Rep',
        email: 'new@acme.test',
        slackMemberId: null,
      });
    });
  });

  it('uploading a CSV posts multipart form data and renders the result summary', async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/accounts/upload')) {
        expect(init?.body).toBeInstanceOf(FormData);
        // multipart uploads must not force a JSON content-type — the
        // browser needs to set its own boundary.
        expect((init?.headers as Record<string, string> | undefined)?.['Content-Type']).toBeUndefined();
        return Promise.resolve(
          jsonResponse(200, {
            successCount: 1,
            errorCount: 1,
            results: [
              { row: 2, status: 'ok', account: 'acme.com' },
              { row: 3, status: 'error', account: 'unknown.com', error: 'unknown rep email: ghost@acme.test' },
            ],
          })
        );
      }
      return Promise.resolve(routeFetch(url));
    });
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();
    await screen.findByText('jamie@acme.test');

    const file = new File(['account,repEmail\nacme.com,jamie@acme.test\n'], 'accounts.csv', {
      type: 'text/csv',
    });
    const user = userEvent.setup();
    // No accessible label on the file input (only surrounding paragraph
    // copy) — query by type=file directly.
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);

    expect(await screen.findByText('1 mapped, 1 error.')).toBeInTheDocument();
    expect(await screen.findByText('unknown rep email: ghost@acme.test')).toBeInTheDocument();
  });

  it('shows the Slack presence status per rep (KAN-65, detection only)', async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/reps/presence')) {
        return Promise.resolve(jsonResponse(200, [{ repId: 'rep-1', name: 'Jamie', status: 'away' }]));
      }
      return Promise.resolve(routeFetch(url));
    });
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();

    await screen.findByText('jamie@acme.test');
    expect(await screen.findByText('Away')).toBeInTheDocument();
  });

  it('shows — for a rep with unknown presence (no Slack connection or no slack member id)', async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => Promise.resolve(routeFetch(url)));
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();

    await screen.findByText('jamie@acme.test');
    expect(await screen.findByText('—')).toBeInTheDocument();
  });

  it('loads the routing page successfully even when the presence endpoint itself fails (e.g. a disconnected Slack workspace)', async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/reps/presence')) return Promise.resolve(jsonResponse(500, { error: 'internal' }));
      return Promise.resolve(routeFetch(url));
    });
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();

    // The page itself (reps table, accounts, audit log) must render fully
    // regardless — presence is a purely additive signal, never a
    // precondition for the rest of the page.
    expect(await screen.findByText('jamie@acme.test')).toBeInTheDocument();
    expect(await screen.findByText('Account list (1 mapped)')).toBeInTheDocument();
    expect(await screen.findByText('—')).toBeInTheDocument(); // falls back to unknown, not an error state
  });

  it('renders the reps table without waiting for a slow presence fetch (non-blocking)', async () => {
    let resolvePresence!: (res: Response) => void;
    const presencePromise = new Promise<Response>((resolve) => {
      resolvePresence = resolve;
    });
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/reps/presence')) return presencePromise;
      return Promise.resolve(routeFetch(url));
    });
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();

    // Reps table appears while the presence fetch is still pending. Uses
    // 'away' (not 'active') deliberately — the pre-existing rep Status
    // column already renders the literal text "Active" for any active
    // rep, unrelated to Slack presence, so asserting presence absence via
    // that string would be a false positive.
    expect(await screen.findByText('jamie@acme.test')).toBeInTheDocument();
    expect(screen.queryByText('Away')).not.toBeInTheDocument();

    resolvePresence(jsonResponse(200, [{ repId: 'rep-1', name: 'Jamie', status: 'away' }]));
    expect(await screen.findByText('Away')).toBeInTheDocument();
  });
});
