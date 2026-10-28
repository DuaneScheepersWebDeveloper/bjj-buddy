import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, type AuthResponse, type User } from '../lib/api';
import { clearToken, loadToken, saveToken } from '../lib/tokenStorage';
import { setErrorUser } from '../lib/errorReporter';

type Status = 'loading' | 'signedOut' | 'signedIn';

type AuthState = {
  status: Status;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (fullName: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const finishSignIn = useCallback(async (res: AuthResponse) => {
    await saveToken(res.access_token);
    setToken(res.access_token);
    setUser(res.user);
    setErrorUser(res.user.id);
    setStatus('signedIn');
  }, []);

  const resetToSignedOut = useCallback(async () => {
    await clearToken();
    setToken(null);
    setUser(null);
    setErrorUser(null);
    setStatus('signedOut');
  }, []);

  // On launch: if a token was saved, check it's still valid and load the user.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadToken();
      if (!saved) {
        if (!cancelled) setStatus('signedOut');
        return;
      }
      try {
        const me = await api<User>('/auth/me', { token: saved });
        if (cancelled) return;
        setToken(saved);
        setUser(me);
        setErrorUser(me.id);
        setStatus('signedIn');
      } catch (err) {
        if (cancelled) return;
        // Only forget the token if the server rejected it. If we're just offline, keep it for next time.
        if (err instanceof ApiError && err.status === 401) await clearToken();
        setStatus('signedOut');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const res = await api<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } });
      await finishSignIn(res);
    },
    [finishSignIn],
  );

  const signUp = useCallback(
    async (fullName: string, email: string, password: string) => {
      const res = await api<AuthResponse>('/auth/register', {
        method: 'POST',
        body: { full_name: fullName, email, password },
      });
      await finishSignIn(res);
    },
    [finishSignIn],
  );

  const requestPasswordReset = useCallback(async (email: string) => {
    await api('/auth/forgot-password', { method: 'POST', body: { email } });
  }, []);

  const resetPassword = useCallback(
    async (email: string, code: string, newPassword: string) => {
      const res = await api<AuthResponse>('/auth/reset-password', {
        method: 'POST',
        body: { email, code, new_password: newPassword },
      });
      await finishSignIn(res);
    },
    [finishSignIn],
  );

  const signOut = useCallback(async () => {
    const current = token;
    // Log out locally straight away so the button feels instant,
    // then tell the server to kill the token (ignore failures, e.g. offline).
    await resetToSignedOut();
    if (current) api('/auth/logout', { method: 'POST', token: current }).catch(() => {});
  }, [token, resetToSignedOut]);

  const value = useMemo(
    () => ({ status, user, signIn, signUp, signOut, requestPasswordReset, resetPassword }),
    [status, user, signIn, signUp, signOut, requestPasswordReset, resetPassword],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
