'use client';

import { createContext, useContext, useEffect, useState, useCallback, useSyncExternalStore } from 'react';
import { getCurrentTokens, subscribeTokens, getStoredRefreshToken } from './auth-store';
import { login as apiLogin, logout as apiLogout, silentRefresh } from './api-client';

interface AuthContextValue {
  accessToken: string | null;
  workspaceId: string | null;
  // True until the initial mount-time silent-refresh attempt resolves —
  // callers (the protected layout) must not redirect to /login while this
  // is true, or a valid session gets bounced on every page reload.
  isInitializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

function getServerSnapshot(): null {
  return null; // server never has a token — access token is memory-only, client-side
}

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const tokens = useSyncExternalStore(subscribeTokens, getCurrentTokens, getServerSnapshot);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (getStoredRefreshToken()) {
        await silentRefresh();
      }
      if (!cancelled) setIsInitializing(false);
    })();
    return () => {
      cancelled = true;
    };
    // Runs once on mount only — this is the app-bootstrap silent refresh.
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await apiLogin(email, password);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        accessToken: tokens?.accessToken ?? null,
        workspaceId: tokens?.workspaceId ?? null,
        isInitializing,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
