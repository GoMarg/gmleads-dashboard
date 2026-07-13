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

import CrmPage from '@/app/leads/crm/page';

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
      <CrmPage />
    </QueryClientProvider>
  );
}

function routeFetch(url: string): Response {
  if (url.includes('/crm/status')) return jsonResponse(200, { connected: false });
  if (url.includes('/crm/mappings')) return jsonResponse(200, []);
  if (url.includes('/crm/activity-log')) return jsonResponse(200, []);
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

describe('CrmPage', () => {
  it('shows a Connect button when no CRM is connected', async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => Promise.resolve(routeFetch(url)));
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();

    expect(await screen.findByRole('button', { name: 'Connect HubSpot' })).toBeInTheDocument();
    expect(await screen.findByText('No CRM connected yet.')).toBeInTheDocument();
  });

  it('shows connected status with the provider name when connected', async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/crm/status')) {
        return Promise.resolve(
          jsonResponse(200, { connected: true, provider: 'hubspot', connectedAt: '2026-07-01T00:00:00Z' })
        );
      }
      return Promise.resolve(routeFetch(url));
    });
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();

    expect(await screen.findByText(/Connected to/)).toBeInTheDocument();
    expect(screen.getByText('HubSpot')).toBeInTheDocument();
  });

  it('redirects the browser to the authorization URL on connect', async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/crm/connect') && init?.method === 'POST') {
        return Promise.resolve(jsonResponse(200, { authorizationUrl: 'https://app.hubspot.com/oauth/authorize?x=1' }));
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
    await user.click(await screen.findByRole('button', { name: 'Connect HubSpot' }));

    await waitFor(() => expect(assignedHref).toBe('https://app.hubspot.com/oauth/authorize?x=1'));
  });

  it('shows a success message when redirected back with crm=connected', async () => {
    mockSearchParams = new URLSearchParams('crm=connected');
    const fetchSpy = vi.fn().mockImplementation((url: string) => Promise.resolve(routeFetch(url)));
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();

    expect(await screen.findByText('CRM connected successfully.')).toBeInTheDocument();
  });

  it('shows an error message when redirected back with crm=error', async () => {
    mockSearchParams = new URLSearchParams('crm=error');
    const fetchSpy = vi.fn().mockImplementation((url: string) => Promise.resolve(routeFetch(url)));
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();

    expect(await screen.findByText('Could not connect the CRM. Please try again.')).toBeInTheDocument();
  });

  it('saves a field mapping', async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/crm/mappings') && init?.method === 'PUT') {
        return Promise.resolve(
          jsonResponse(200, [{ id: 'm-1', workspaceId: 'workspace-a', gmleadsField: 'company_name', crmProperty: 'name', objectType: 'company' }])
        );
      }
      return Promise.resolve(routeFetch(url));
    });
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();
    const user = userEvent.setup();
    const companyInput = (await screen.findAllByRole('textbox'))[0]!;
    await user.type(companyInput, 'name');
    await user.click(screen.getByRole('button', { name: 'Save mapping' }));

    await waitFor(() => {
      const putCall = fetchSpy.mock.calls.find(
        ([url, init]) => (url as string).includes('/crm/mappings') && (init as RequestInit)?.method === 'PUT'
      );
      expect(putCall).toBeDefined();
    });
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });

  it('renders activity log rows, including failures', async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/crm/activity-log')) {
        return Promise.resolve(
          jsonResponse(200, [
            {
              id: 'p-1',
              workspaceId: 'workspace-a',
              sourceType: 'lead_qualified',
              sourceId: 'session-1',
              status: 'failed',
              crmRecordId: null,
              errorMessage: 'rate limited',
              createdAt: '2026-07-01T00:00:00Z',
            },
          ])
        );
      }
      return Promise.resolve(routeFetch(url));
    });
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();

    expect(await screen.findByText('Lead qualified')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('rate limited')).toBeInTheDocument();
  });
});
