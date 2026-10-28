/**
 * Small wrapper around fetch for talking to the BJJ Buddy API.
 * Set the address in Mobile/.env:  EXPO_PUBLIC_API_URL=http://192.168.x.x:8000
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

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
