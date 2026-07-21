import { describe, it, expect, beforeEach } from 'vitest';
import { getCurrentTokens, setCurrentTokens, subscribeTokens, getStoredRefreshToken } from '@/lib/auth-store';

const tokens = { accessToken: 'access-1', refreshToken: 'refresh-1', workspaceId: 'ws-1' };

beforeEach(() => {
  setCurrentTokens(null);
});

describe('auth-store', () => {
  it('starts with no tokens', () => {
    expect(getCurrentTokens()).toBeNull();
    expect(getStoredRefreshToken()).toBeNull();
  });

  it('persists the refresh token to localStorage but keeps the access token in memory only', () => {
    setCurrentTokens(tokens);

    expect(getCurrentTokens()).toEqual(tokens);
    expect(getStoredRefreshToken()).toBe('refresh-1');
    // The raw localStorage value must never contain the access token —
    // this is the whole point of "access token in memory only" (KAN-100
    // decision, ADR-014).
    expect(window.localStorage.getItem('gmleads_refresh_token')).toBe('refresh-1');
    expect(JSON.stringify(window.localStorage)).not.toContain('access-1');
  });

  it('clears localStorage when tokens are set to null', () => {
    setCurrentTokens(tokens);
    setCurrentTokens(null);

    expect(getCurrentTokens()).toBeNull();
    expect(getStoredRefreshToken()).toBeNull();
  });

  it('notifies subscribers on every token change', () => {
    const seen: Array<typeof tokens | null> = [];
    const unsubscribe = subscribeTokens((next) => seen.push(next));

    setCurrentTokens(tokens);
    setCurrentTokens(null);
    unsubscribe();
    setCurrentTokens(tokens); // after unsubscribe — should not be recorded

    expect(seen).toEqual([tokens, null]);
  });
});
