import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Providers } from '@/components/providers';
import { setCurrentTokens } from '@/lib/auth-store';

beforeEach(() => {
  setCurrentTokens(null);
  vi.restoreAllMocks();
});

describe('Providers', () => {
  it('wraps children with QueryClientProvider and AuthProvider', () => {
    vi.stubGlobal('fetch', vi.fn());
    render(
      <Providers>
        <div>app content</div>
      </Providers>
    );
    expect(screen.getByText('app content')).toBeInTheDocument();
  });
});
