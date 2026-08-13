import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  type AuthStatus,
  fetchAuthStatus,
  loginWithPassword,
  logout as logoutRequest,
  verifyMfa as verifyMfaRequest,
} from "../lib/auth";

interface AuthContextValue {
  status: AuthStatus | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  verifyMfa: (code: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

const EMPTY_STATUS: AuthStatus = {
  authenticated: false,
  mfaRequired: false,
  user: null,
};

const AuthContext = createContext<AuthContextValue>({
  status: null,
  loading: true,
  isAuthenticated: false,
  login: async () => undefined,
  verifyMfa: async () => undefined,
  signOut: async () => undefined,
  refreshStatus: async () => undefined,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshStatus = useCallback(async () => {
    setStatus(await fetchAuthStatus());
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAuthStatus()
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch(() => {
        if (!cancelled) setStatus(EMPTY_STATUS);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginWithPassword(email, password);
    setStatus({
      authenticated: !result.mfaRequired,
      mfaRequired: result.mfaRequired === true,
      user: result.user,
    });
  }, []);

  const verifyMfa = useCallback(async (code: string) => {
    await verifyMfaRequest(code);
    await refreshStatus();
  }, [refreshStatus]);

  const signOut = useCallback(async () => {
    await logoutRequest();
    setStatus(EMPTY_STATUS);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        status,
        loading,
        isAuthenticated: status?.authenticated === true,
        login,
        verifyMfa,
        signOut,
        refreshStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
