import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { User } from './api';

/**
 * Remembers the login between app launches, on this device only.
 * On phones it lives in the encrypted Keychain / Keystore (expo-secure-store).
 * SecureStore doesn't work in a web browser, so `expo start --web` falls back to localStorage.
 *
 * We keep two things:
 *  - the login token (proves who you are to the API)
 *  - a copy of your profile, so the app can open straight to the home screen
 *    without waiting for the server (it's refreshed in the background).
 */
const TOKEN_KEY = 'bjjbuddy.auth_token';
const USER_KEY = 'bjjbuddy.user';

async function getItem(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function setItem(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  } catch {
    // If saving fails the user stays logged in for this launch only.
  }
}

async function removeItem(key: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Nothing stored, nothing to clear.
  }
}

export const loadToken = () => getItem(TOKEN_KEY);
export const saveToken = (token: string) => setItem(TOKEN_KEY, token);

export async function loadCachedUser(): Promise<User | null> {
  const raw = await getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export const saveCachedUser = (user: User) => setItem(USER_KEY, JSON.stringify(user));

/** Forget everything about the login on this device. */
export async function clearToken(): Promise<void> {
  await Promise.all([removeItem(TOKEN_KEY), removeItem(USER_KEY)]);
}
