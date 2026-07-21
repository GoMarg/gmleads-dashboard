import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUseAuth = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

import SlackPage from '@/app/leads/slack/page';

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
      <SlackPage />
    </QueryClientProvider>
  );
}

function routeFetch(url: string): Response {
  if (url.includes('/slack/status')) return jsonResponse(200, { connected: false });
  return jsonResponse(404, { error: 'unexpected_url' });
}

beforeEach(() => {
  vi.restoreAllMocks();
  mockSearchParams = new URLSearchParams();
  mockUseAuth.mockReturnValue({
    accessToken: 'token',
    workspaceId: 'workspace-a',
    isInitializing: false,
    login: vi.fn(),
    logout: vi.fn(),
  });
});

describe('SlackPage', () => {
  it('shows a Connect button when no Slack workspace is connected', async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => Promise.resolve(routeFetch(url)));
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();

    expect(await screen.findByRole('button', { name: 'Connect Slack' })).toBeInTheDocument();
    expect(await screen.findByText('No Slack workspace connected yet.')).toBeInTheDocument();
  });

  it('redirects the browser to the authorization URL on connect', async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/slack/connect') && init?.method === 'POST') {
        return Promise.resolve(jsonResponse(200, { authorizationUrl: 'https://slack.com/oauth/v2/authorize?x=1' }));
      }
      return Promise.resolve(routeFetch(url));
    });
    vi.stubGlobal('fetch', fetchSpy);

    // jsdom throws on real navigation — stub the setter instead of letting
    // it fire for real, then assert on what the component tried to set.
    let assignedHref = '';
    Object.defineProperty(window, 'location', {
      value: { ...window.location, set href(value: string) { assignedHref = value; }, get href() { return assignedHref; } },
      writable: true,
    });

    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Connect Slack' }));

    await waitFor(() => expect(assignedHref).toBe('https://slack.com/oauth/v2/authorize?x=1'));
  });

  it('shows connected status with the team name and prompts for a channel when none is picked yet', async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/slack/status')) {
        return Promise.resolve(
          jsonResponse(200, { connected: true, teamName: 'Acme Workspace', connectedAt: '2026-07-01T00:00:00Z' })
        );
      }
      if (url.includes('/slack/channels')) {
        return Promise.resolve(jsonResponse(200, [{ id: 'C1', name: 'general' }, { id: 'C2', name: 'sales' }]));
      }
      return Promise.resolve(routeFetch(url));
    });
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();

    expect(await screen.findByText(/Connected to/)).toBeInTheDocument();
    expect(screen.getByText('Acme Workspace')).toBeInTheDocument();
    expect(await screen.findByText('#general')).toBeInTheDocument();
    expect(await screen.findByText('#sales')).toBeInTheDocument();
  });

  it('saves the picked channel', async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/slack/status')) {
        return Promise.resolve(jsonResponse(200, { connected: true, teamName: 'Acme Workspace' }));
      }
      if (url.includes('/slack/channels')) {
        return Promise.resolve(jsonResponse(200, [{ id: 'C1', name: 'general' }]));
      }
      if (url.includes('/slack/channel') && init?.method === 'PUT') {
        return Promise.resolve(jsonResponse(200, { defaultChannelId: 'C1', defaultChannelName: 'general' }));
      }
      return Promise.resolve(routeFetch(url));
    });
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();
    const user = userEvent.setup();
    const select = await screen.findByRole('combobox');
    await user.selectOptions(select, 'C1');
    await user.click(screen.getByRole('button', { name: 'Save channel' }));

    await waitFor(() => {
      const putCall = fetchSpy.mock.calls.find(
        ([url, init]) => (url as string).includes('/slack/channel') && (init as RequestInit)?.method === 'PUT'
      );
      expect(putCall).toBeDefined();
    });
  });

  it('shows the default channel and a Change channel link once one is picked', async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/slack/status')) {
        return Promise.resolve(
          jsonResponse(200, { connected: true, teamName: 'Acme Workspace', defaultChannelName: 'leads' })
        );
      }
      return Promise.resolve(routeFetch(url));
    });
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();

    expect(await screen.findByText(/Posting alerts to/)).toBeInTheDocument();
    expect(screen.getByText('#leads')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change channel' })).toBeInTheDocument();
  });

  it('disconnects Slack', async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/slack/status')) {
        return Promise.resolve(
          jsonResponse(200, { connected: true, teamName: 'Acme Workspace', defaultChannelName: 'leads' })
        );
      }
      if (url.includes('/slack/disconnect') && init?.method === 'POST') {
        return Promise.resolve(jsonResponse(200, { success: true }));
      }
      return Promise.resolve(routeFetch(url));
    });
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Disconnect' }));

    await waitFor(() => {
      const disconnectCall = fetchSpy.mock.calls.find(
        ([url, init]) => (url as string).includes('/slack/disconnect') && (init as RequestInit)?.method === 'POST'
      );
      expect(disconnectCall).toBeDefined();
    });
  });

  it('shows a success message when redirected back with slack=connected', async () => {
    mockSearchParams = new URLSearchParams('slack=connected');
    const fetchSpy = vi.fn().mockImplementation((url: string) => Promise.resolve(routeFetch(url)));
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();

    expect(await screen.findByText('Slack connected successfully.')).toBeInTheDocument();
  });

  it('shows an error message when redirected back with slack=error', async () => {
    mockSearchParams = new URLSearchParams('slack=error');
    const fetchSpy = vi.fn().mockImplementation((url: string) => Promise.resolve(routeFetch(url)));
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();

    expect(await screen.findByText('Could not connect Slack. Please try again.')).toBeInTheDocument();
  });
});
