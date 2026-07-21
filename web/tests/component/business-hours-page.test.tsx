import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUseAuth = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

import BusinessHoursPage from '@/app/leads/business-hours/page';

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
      <BusinessHoursPage />
    </QueryClientProvider>
  );
}

const UNCONFIGURED = { businessHours: null, timezone: null };
const CONFIGURED = {
  businessHours: { mon: { open: '09:00', close: '17:00' } },
  timezone: 'America/New_York',
};

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

describe('BusinessHoursPage', () => {
  it('renders an unconfigured workspace with every day unchecked and no timezone', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(200, UNCONFIGURED)))
    );
    renderPage();

    await screen.findByRole('heading', { level: 1, name: 'Business hours' });
    expect(screen.getByLabelText(/Timezone/)).toHaveValue('');
    expect(screen.getByRole('checkbox', { name: 'Monday' })).not.toBeChecked();
  });

  it('renders a configured workspace with the saved day/timezone reflected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(200, CONFIGURED)))
    );
    renderPage();

    expect(await screen.findByDisplayValue('America/New_York')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Monday' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Tuesday' })).not.toBeChecked();
  });

  it('saving PATCHes the checked days and timezone', async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/business-hours') && init?.method === 'PATCH') {
        return Promise.resolve(jsonResponse(200, CONFIGURED));
      }
      return Promise.resolve(jsonResponse(200, UNCONFIGURED));
    });
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Business hours' });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Timezone/), 'America/New_York');
    await user.click(screen.getByRole('checkbox', { name: 'Monday' }));
    await user.click(screen.getByRole('button', { name: 'Save business hours' }));

    await waitFor(() => {
      const call = fetchSpy.mock.calls.find(
        ([url, init]) => (url as string).includes('/business-hours') && (init as RequestInit)?.method === 'PATCH'
      );
      expect(call).toBeDefined();
      expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({
        businessHours: { mon: { open: '09:00', close: '17:00' } },
        timezone: 'America/New_York',
      });
    });
  });

  it('unchecking every day saves businessHours as null', async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/business-hours') && init?.method === 'PATCH') {
        return Promise.resolve(jsonResponse(200, UNCONFIGURED));
      }
      return Promise.resolve(jsonResponse(200, CONFIGURED));
    });
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();
    await screen.findByDisplayValue('America/New_York');

    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: 'Monday' }));
    await user.click(screen.getByRole('button', { name: 'Save business hours' }));

    await waitFor(() => {
      const call = fetchSpy.mock.calls.find(
        ([url, init]) => (url as string).includes('/business-hours') && (init as RequestInit)?.method === 'PATCH'
      );
      expect(call).toBeDefined();
      expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({
        businessHours: null,
        timezone: 'America/New_York',
      });
    });
  });
});
