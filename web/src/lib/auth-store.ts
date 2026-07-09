// KAN-100: the single source of truth for the current session's tokens.
//
// Deliberately NOT React state — this is a plain module so lib/api-client.ts
// (used from React Query query functions, outside any component) can read
// and update it without a hook. lib/auth-context.tsx wraps it in a
// useSyncExternalStore subscription for components that need to render
// based on auth state.
//
// accessToken lives ONLY here, in memory — it is never written to
// localStorage/sessionStorage/a cookie, and is lost on every full page
// reload (recovered via a silent refresh on app bootstrap, see
// auth-context.tsx). refreshToken is the only piece of auth state persisted
// client-side, and this module is the only place that touches localStorage
// for it — see ADR-014 for the full rationale (Option B: no BFF, no
// cookies, no server-side session).
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  workspaceId: string;
}

type Listener = (tokens: AuthTokens | null) => void;

const REFRESH_TOKEN_STORAGE_KEY = 'gmleads_refresh_token';

let current: AuthTokens | null = null;
const listeners = new Set<Listener>();

export function getCurrentTokens(): AuthTokens | null {
  return current;
}

export function setCurrentTokens(tokens: AuthTokens | null): void {
  current = tokens;
  if (typeof window !== 'undefined') {
    if (tokens) {
      window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, tokens.refreshToken);
    } else {
      window.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    }
  }
  for (const listener of listeners) listener(current);
}

export function subscribeTokens(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStoredRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
}
