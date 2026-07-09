import { describe, it, expect, beforeEach, vi } from 'vitest';
import { login, logout, silentRefresh, authFetch, ApiError } from '@/lib/api-client';
import { getCurrentTokens, setCurrentTokens } from '@/lib/auth-store';

const tokens = { accessToken: 'access-1', refreshToken: 'refresh-1', workspaceId: 'ws-1' };
const rotatedTokens = { accessToken: 'access-2', refreshToken: 'refresh-2', workspaceId: 'ws-1' };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  setCurrentTokens(null);
  vi.restoreAllMocks();
});

describe('login', () => {
  it('stores the returned tokens on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, tokens))
    );

    const result = await login('a@b.com', 'password123');

    expect(result).toEqual(tokens);
    expect(getCurrentTokens()).toEqual(tokens);
  });

  it('throws ApiError and stores nothing on invalid credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(401, { error: 'invalid_credentials' }))
    );

    await expect(login('a@b.com', 'wrong')).rejects.toBeInstanceOf(ApiError);
    expect(getCurrentTokens()).toBeNull();
  });
});

describe('logout', () => {
  it('clears local tokens immediately even if the server call fails', async () => {
    setCurrentTokens(tokens);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await logout();

    expect(getCurrentTokens()).toBeNull();
  });
});

describe('silentRefresh', () => {
  it('rotates tokens on success', async () => {
    setCurrentTokens(tokens);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, rotatedTokens)));

    const result = await silentRefresh();

    expect(result).toEqual(rotatedTokens);
    expect(getCurrentTokens()).toEqual(rotatedTokens);
  });

  it('clears tokens and returns null when the refresh token is rejected', async () => {
    setCurrentTokens(tokens);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { error: 'invalid_refresh_token' })));

    const result = await silentRefresh();

    expect(result).toBeNull();
    expect(getCurrentTokens()).toBeNull();
  });

  it('returns null with no network call when there is no refresh token at all', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await silentRefresh();

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('dedupes concurrent calls into a single network request', async () => {
    setCurrentTokens(tokens);
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(200, rotatedTokens));
    vi.stubGlobal('fetch', fetchSpy);

    const [a, b] = await Promise.all([silentRefresh(), silentRefresh()]);

    expect(a).toEqual(rotatedTokens);
    expect(b).toEqual(rotatedTokens);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('authFetch', () => {
  it('attaches the current access token', async () => {
    setCurrentTokens(tokens);
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchSpy);

    await authFetch('/api/workspaces/ws-1/leads');

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
  });

  it('on a 401, refreshes once and retries with the new access token', async () => {
    setCurrentTokens(tokens);
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: 'unauthorized' })) // original request
      .mockResolvedValueOnce(jsonResponse(200, rotatedTokens)) // refresh call
      .mockResolvedValueOnce(jsonResponse(200, { ok: true })); // retried request
    vi.stubGlobal('fetch', fetchSpy);

    const result = await authFetch<{ ok: boolean }>('/api/workspaces/ws-1/leads');

    expect(result).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const retryInit = fetchSpy.mock.calls[2][1] as RequestInit;
    expect((retryInit.headers as Record<string, string>).Authorization).toBe('Bearer access-2');
  });

  it('propagates a 403 (tenant-isolation rejection) as-is, without attempting a refresh', async () => {
    setCurrentTokens(tokens);
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(403, { error: 'forbidden' }));
    vi.stubGlobal('fetch', fetchSpy);

    await expect(authFetch('/api/workspaces/other-ws/leads')).rejects.toMatchObject({
      status: 403,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1); // no refresh attempt for a 403
  });

  it('throws when the refresh after a 401 also fails', async () => {
    setCurrentTokens(tokens);
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: 'unauthorized' }))
      .mockResolvedValueOnce(jsonResponse(401, { error: 'invalid_refresh_token' }));
    vi.stubGlobal('fetch', fetchSpy);

    await expect(authFetch('/api/workspaces/ws-1/leads')).rejects.toBeInstanceOf(ApiError);
    expect(getCurrentTokens()).toBeNull();
  });
});
