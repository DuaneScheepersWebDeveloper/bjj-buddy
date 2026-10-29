import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Small wrapper around fetch for talking to the BJJ Buddy API.
 *
 * Where the API lives is worked out automatically while developing:
 *  - In a web browser: the same computer the page came from, port 8000.
 *  - On a phone (Expo Go): the computer running `npx expo start`, port 8000.
 *    "localhost" on a phone means the phone itself, so we never use it there.
 * Set EXPO_PUBLIC_API_URL in Mobile/.env only to point somewhere else
 * (e.g. a deployed server).
 */
const API_PORT = 8000;
const LOCALHOST_URL = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i;

/** IP address of the computer running the Expo dev server, e.g. "192.168.1.23". */
function devServerIp(): string | null {
  const hostUri = Constants.expoConfig?.hostUri ?? ''; // e.g. "192.168.1.23:8081"
  const host = hostUri.split(':')[0];
  // Android emulator connected through "localhost": the PC is 10.0.2.2 from inside the emulator.
  if (Platform.OS === 'android' && (host === 'localhost' || host === '127.0.0.1')) return '10.0.2.2';
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) && host !== '127.0.0.1' ? host : null;
}

function resolveApiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || null;

  if (Platform.OS === 'web') {
    const host = (globalThis as { location?: { hostname?: string } }).location?.hostname || 'localhost';
    return configured ?? `http://${host}:${API_PORT}`;
  }

  if (configured && !LOCALHOST_URL.test(configured)) return configured;
  const ip = devServerIp();
  if (ip) return `http://${ip}:${API_PORT}`;
  return configured ?? `http://localhost:${API_PORT}`;
}

export const API_URL = resolveApiUrl();
if (__DEV__) console.log(`[api] Using API at ${API_URL}`);

export type User = {
  id: number;
  email: string;
  full_name: string;
  belt_rank: string;
  is_active: boolean;
  created_at: string;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  expires_at: string;
  user: User;
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Turn FastAPI's error body into one readable sentence. */
function messageFrom(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    // 422 validation errors: [{ loc: [...], msg: "..." }]
    const first = detail[0] as { loc?: unknown[]; msg?: string };
    const field = String(first.loc?.[first.loc.length - 1] ?? '');
    let msg = (first.msg ?? 'Invalid input').replace(/^Value error, /, '');
    if (field === 'password' && /at least/.test(msg)) msg = 'Password must be at least 8 characters';
    return msg;
  }
  if (status >= 500) return 'Something went wrong on our side. Please try again.';
  return 'Request failed. Please try again.';
}

type Options = { method?: string; body?: unknown; token?: string | null };

export async function api<T>(path: string, { method = 'GET', body, token }: Options = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    const hint = __DEV__ ? ` (tried ${API_URL})` : '';
    throw new ApiError(`Can't reach the server. Check your connection and try again.${hint}`, 0);
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(messageFrom(data, res.status), res.status);
  return data as T;
}
