import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mockUseAuth = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

import LeadsLayout from '@/app/leads/layout';

beforeEach(() => {
  vi.restoreAllMocks();
  mockReplace.mockClear();
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

    render(<LeadsLayout>{<div>protected content</div>}</LeadsLayout>);

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

    render(<LeadsLayout>{<div>protected content</div>}</LeadsLayout>);

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

    render(<LeadsLayout>{<div>protected content</div>}</LeadsLayout>);

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

    render(<LeadsLayout>{<div>protected content</div>}</LeadsLayout>);

    expect(screen.getByRole('link', { name: 'Leads' })).toHaveAttribute('href', '/leads');
    expect(screen.getByRole('link', { name: 'Funnel' })).toHaveAttribute('href', '/leads/funnel');
  });
});
