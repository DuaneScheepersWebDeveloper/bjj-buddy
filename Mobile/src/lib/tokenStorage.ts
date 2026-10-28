import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Keeps the login token between app launches.
 * On phones it lives in the encrypted Keychain / Keystore (expo-secure-store).
 * SecureStore doesn't work in a web browser, so `expo start --web` falls back to localStorage.
 */
const KEY = 'bjjbuddy.auth_token';

export async function loadToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) ?? null;
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function saveToken(token: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(KEY, token);
      return;
    }
    await SecureStore.setItemAsync(KEY, token);
  } catch {
    // If saving fails the user stays logged in for this launch only.
  }
}

export async function clearToken(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.removeItem(KEY);
      return;
    }
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
}
