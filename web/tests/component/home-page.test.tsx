import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mockUseAuth = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

import HomePage from '@/app/page';

beforeEach(() => {
  mockReplace.mockClear();
});

describe('HomePage', () => {
  it('does nothing while auth is still initializing', () => {
    mockUseAuth.mockReturnValue({ accessToken: null, isInitializing: true });
    render(<HomePage />);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects to /leads when authenticated', async () => {
    mockUseAuth.mockReturnValue({ accessToken: 'token', isInitializing: false });
    render(<HomePage />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/leads'));
  });

  it('redirects to /login when not authenticated', async () => {
    mockUseAuth.mockReturnValue({ accessToken: null, isInitializing: false });
    render(<HomePage />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
  });
});
