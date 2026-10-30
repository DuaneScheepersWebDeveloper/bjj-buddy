import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, type AuthResponse, type ProfileChanges, type RequestOptions, type User } from '../lib/api';
import { clearToken, loadCachedUser, loadToken, saveCachedUser, saveToken } from '../lib/tokenStorage';
import { setErrorUser } from '../lib/errorReporter';

type Status = 'loading' | 'signedOut' | 'signedIn';

type AuthState = {
  status: Status;
  user: User | null;
  /** `login` is an email address or a username. */
  signIn: (login: string, password: string) => Promise<void>;
  signUp: (fullName: string, username: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  /** Call the API as the logged-in user. Logs out automatically if the session has ended. */
  request: <T>(path: string, options?: RequestOptions) => Promise<T>;
  /** Show (and remember on this phone) a user object, e.g. after an offline edit or a sync. */
  replaceUser: (user: User) => Promise<void>;
  /** Re-fetch the logged-in user (e.g. after a role change). */
  refreshUser: () => Promise<void>;
  /** Save changes to your own profile. */
  updateProfile: (changes: ProfileChanges) => Promise<User>;
  /** Upload a new profile picture (base64 image data). */
  uploadAvatar: (imageBase64: string) => Promise<User>;
  removeAvatar: () => Promise<User>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const finishSignIn = useCallback(async (res: AuthResponse) => {
    await Promise.all([saveToken(res.access_token), saveCachedUser(res.user)]);
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

  // On launch: stay signed in on this device.
  //  - If we remember who you are, open straight to the app and check with the
  //    server in the background.
  //  - Only send you back to the login screen if the server says the session has
  //    ended (logged out elsewhere, expired after 30 days, or account deactivated).
  //    Being offline or the server being down never logs you out.
  useEffect(() => {
    let cancelled = false;

    const verify = async (saved: string) => {
      try {
        const me = await api<User>('/auth/me', { token: saved });
        if (cancelled) return 'ok' as const;
        setUser(me);
        setErrorUser(me.id);
        await saveCachedUser(me);
        return 'ok' as const;
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return 'rejected' as const;
        return 'unreachable' as const;
      }
    };

    (async () => {
      const [saved, cached] = await Promise.all([loadToken(), loadCachedUser()]);
      if (cancelled) return;
      if (!saved) {
        setStatus('signedOut');
        return;
      }

      if (cached) {
        setToken(saved);
        setUser(cached);
        setErrorUser(cached.id);
        setStatus('signedIn');
        if ((await verify(saved)) === 'rejected' && !cancelled) await resetToSignedOut();
        return;
      }

      // Signed in before this update (no saved profile yet): we need the server once.
      // Retry a few times in case the network or the API is still waking up.
      for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
        const result = await verify(saved);
        if (cancelled) return;
        if (result === 'ok') {
          setToken(saved);
          setStatus('signedIn');
          return;
        }
        if (result === 'rejected') {
          await resetToSignedOut();
          return;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      // Still can't reach the server: show the login screen, but keep the token so the
      // next launch can try again.
      if (!cancelled) setStatus('signedOut');
    })();

    return () => {
      cancelled = true;
    };
  }, [resetToSignedOut]);

  const signIn = useCallback(
    async (login: string, password: string) => {
      const res = await api<AuthResponse>('/auth/login', { method: 'POST', body: { login, password } });
      await finishSignIn(res);
    },
    [finishSignIn],
  );

  const signUp = useCallback(
    async (fullName: string, username: string, email: string, password: string) => {
      const res = await api<AuthResponse>('/auth/register', {
        method: 'POST',
        body: { full_name: fullName, username, email, password },
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

  const request = useCallback(
    async <T,>(path: string, options: RequestOptions = {}): Promise<T> => {
      try {
        return await api<T>(path, { ...options, token });
      } catch (err) {
        // Session expired, or an admin deactivated this account: back to the login screen.
        if (err instanceof ApiError && err.status === 401) await resetToSignedOut();
        throw err;
      }
    },
    [token, resetToSignedOut],
  );

  const replaceUser = useCallback(async (next: User) => {
    setUser(next);
    await saveCachedUser(next);
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await request<User>('/auth/me');
    setUser(me);
    await saveCachedUser(me);
  }, [request]);

  const updateProfile = useCallback(
    async (changes: ProfileChanges) => {
      const me = await request<User>('/auth/me', { method: 'PATCH', body: changes });
      setUser(me);
      await saveCachedUser(me);
      return me;
    },
    [request],
  );

  const uploadAvatar = useCallback(
    async (imageBase64: string) => {
      const me = await request<User>('/auth/me/avatar', { method: 'PUT', body: { image_base64: imageBase64 } });
      setUser(me);
      await saveCachedUser(me);
      return me;
    },
    [request],
  );

  const removeAvatar = useCallback(async () => {
    const me = await request<User>('/auth/me/avatar', { method: 'DELETE' });
    setUser(me);
    await saveCachedUser(me);
    return me;
  }, [request]);

  const signOut = useCallback(async () => {
    const current = token;
    // Log out locally straight away so the button feels instant,
    // then tell the server to kill the token (ignore failures, e.g. offline).
    await resetToSignedOut();
    if (current) api('/auth/logout', { method: 'POST', token: current }).catch(() => {});
  }, [token, resetToSignedOut]);

  const value = useMemo(
    () => ({
      status,
      user,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      resetPassword,
      request,
      replaceUser,
      refreshUser,
      updateProfile,
      uploadAvatar,
      removeAvatar,
    }),
    [
      status,
      user,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      resetPassword,
      request,
      replaceUser,
      refreshUser,
      updateProfile,
      uploadAvatar,
      removeAvatar,
    ],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
