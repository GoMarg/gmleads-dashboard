import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUseAuth = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

import RepPerformancePage from '@/app/leads/rep-performance/page';

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
      <RepPerformancePage />
    </QueryClientProvider>
  );
}

const STATS = [
  {
    repId: 'rep-1',
    repName: 'Jamie',
    assignedCount: 10,
    respondedCount: 8,
    bookedCount: 3,
    avgResponseMs: 45000,
    medianResponseMs: 30000,
  },
];

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

describe('RepPerformancePage', () => {
  it('renders per-rep metrics including assigned count alongside rates', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, STATS)));
    renderPage();

    expect(await screen.findByText('Jamie')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument(); // assignedCount
    expect(screen.getByText('8')).toBeInTheDocument(); // respondedCount
    expect(screen.getByText('3')).toBeInTheDocument(); // bookedCount
    expect(screen.getByText('45s')).toBeInTheDocument(); // avgResponseMs formatted
  });

  it('shows a placeholder when no reps have been assigned leads yet', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, [])));
    renderPage();
    expect(await screen.findByText(/No routed leads yet/)).toBeInTheDocument();
  });
});
