import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppSettings, Permission, SessionUser } from '@pos/shared';
import { api, ApiError, onPasswordChangeRequired, onUnauthorized } from './api';

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  can: (permission: Permission) => boolean;
  login: (username: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
  setUser: (user: SessionUser | null) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        const user = await api.get<SessionUser>('/auth/me');
        if (!user || typeof user !== 'object' || !Array.isArray(user.permissions)) return null;
        return user;
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 404 || err.status === 0)) return null;
        throw err;
      }
    },
    staleTime: Infinity,
    retry: false,
  });

  const setUser = useCallback(
    (user: SessionUser | null) => {
      qc.setQueryData(['me'], user);
    },
    [qc],
  );

  useEffect(() => {
    onUnauthorized(() => {
      qc.setQueryData(['me'], null);
    });
    onPasswordChangeRequired(() => {
      const current = qc.getQueryData<SessionUser | null>(['me']);
      if (current && !current.mustChangePassword) qc.setQueryData(['me'], { ...current, mustChangePassword: true });
    });
  }, [qc]);

  const value = useMemo<AuthState>(() => {
    const user = me.data ?? null;
    return {
      user,
      loading: me.isLoading,
      can: (p) => !!user?.permissions.includes(p),
      login: async (username, password) => {
        const u = await api.post<SessionUser>('/auth/login', { username, password });
        qc.setQueryData(['me'], u);
        qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
        return u;
      },
      logout: async () => {
        try {
          await api.post('/auth/logout');
        } finally {
          qc.setQueryData(['me'], null);
          qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
        }
      },
      setUser,
    };
  }, [me.data, me.isLoading, qc, setUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function useSettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<AppSettings>('/settings'),
    enabled: !!user && !user.mustChangePassword,
    staleTime: 5 * 60 * 1000,
  });
}
