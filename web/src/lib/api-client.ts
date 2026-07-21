// KAN-100: thin fetch wrapper for the gateway's public API. No axios — this
// is the only HTTP client the frontend needs, and native fetch avoids an
// extra dependency for a browser-only bundle (see ADR-014).
import { getCurrentTokens, setCurrentTokens, getStoredRefreshToken, type AuthTokens } from './auth-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:13000';

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown
  ) {
    super(`API request failed with status ${status}`);
    this.name = 'ApiError';
  }
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function rawFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
}

export async function login(email: string, password: string): Promise<AuthTokens> {
  const res = await rawFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new ApiError(res.status, await safeJson(res));
  const tokens = (await res.json()) as AuthTokens;
  setCurrentTokens(tokens);
  return tokens;
}

export async function logout(): Promise<void> {
  const refreshToken = getCurrentTokens()?.refreshToken ?? getStoredRefreshToken();
  // Client-side logout always "succeeds" immediately — the server call is
  // best-effort (revokes the refresh token server-side so it can't be
  // replayed), never blocks the user from being logged out locally.
  setCurrentTokens(null);
  if (refreshToken) {
    try {
      await rawFetch('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // Best-effort; the client is already logged out regardless.
    }
  }
}

let inFlightRefresh: Promise<AuthTokens | null> | null = null;

// Rotates the refresh token and issues a new access token (KAN-99's
// rotate-on-every-use design). Deduplicated so N concurrent 401s (or the
// app-bootstrap call racing a query) trigger exactly one network call.
export async function silentRefresh(): Promise<AuthTokens | null> {
  if (inFlightRefresh) return inFlightRefresh;

  const refreshToken = getCurrentTokens()?.refreshToken ?? getStoredRefreshToken();
  if (!refreshToken) return null;

  inFlightRefresh = (async () => {
    try {
      const res = await rawFetch('/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        setCurrentTokens(null);
        return null;
      }
      const tokens = (await res.json()) as AuthTokens;
      setCurrentTokens(tokens);
      return tokens;
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}

// Authenticated fetch for every dashboard data call — attaches the current
// access token and, on a 401 (expired 15-min access token, not a tenant-
// isolation rejection — that's a 403 and propagates as-is), attempts exactly
// one silent refresh + retry before giving up.
export async function authFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const doFetch = (accessToken: string | undefined): Promise<Response> =>
    rawFetch(path, {
      ...init,
      headers: {
        ...init.headers,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });

  let res = await doFetch(getCurrentTokens()?.accessToken);
  if (res.status === 401) {
    const refreshed = await silentRefresh();
    if (!refreshed) throw new ApiError(401, await safeJson(res));
    res = await doFetch(refreshed.accessToken);
  }
  if (!res.ok) throw new ApiError(res.status, await safeJson(res));
  return (await res.json()) as T;
}

// KAN-66: bypasses rawFetch/authFetch above because a multipart body must
// let the browser set its own `Content-Type: multipart/form-data;
// boundary=...` header — rawFetch always forces `application/json`, which
// would break the upload. Same 401-refresh-and-retry behavior as authFetch,
// just without the JSON content-type assumption.
export async function uploadFile<T>(path: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append('file', file);

  const doUpload = (accessToken: string | undefined): Promise<Response> =>
    fetch(`${API_URL}${path}`, {
      method: 'POST',
      body: formData,
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });

  let res = await doUpload(getCurrentTokens()?.accessToken);
  if (res.status === 401) {
    const refreshed = await silentRefresh();
    if (!refreshed) throw new ApiError(401, await safeJson(res));
    res = await doUpload(refreshed.accessToken);
  }
  if (!res.ok) throw new ApiError(res.status, await safeJson(res));
  return (await res.json()) as T;
}
