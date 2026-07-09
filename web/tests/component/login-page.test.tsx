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

import LoginPage from '@/app/login/page';

beforeEach(() => {
  mockReplace.mockClear();
});

describe('LoginPage', () => {
  it('renders the login form when not authenticated', () => {
    mockUseAuth.mockReturnValue({ accessToken: null, isInitializing: false, login: vi.fn() });
    render(<LoginPage />);
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
  });

  it('redirects to /leads if already authenticated', async () => {
    mockUseAuth.mockReturnValue({ accessToken: 'token', isInitializing: false, login: vi.fn() });
    render(<LoginPage />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/leads'));
  });

  it('renders nothing while auth is still initializing', () => {
    mockUseAuth.mockReturnValue({ accessToken: null, isInitializing: true, login: vi.fn() });
    const { container } = render(<LoginPage />);
    expect(container).toBeEmptyDOMElement();
  });
});
