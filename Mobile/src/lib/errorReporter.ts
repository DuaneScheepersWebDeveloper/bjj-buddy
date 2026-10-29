import { Platform } from 'react-native';

import { API_URL } from './api';

/**
 * Sends app errors to the BJJ Buddy API (POST /errors/client), where they are
 * stored in the error_log table with source = 'mobile'.
 * The API address is worked out in ./api.ts.
 */

type Level = 'WARNING' | 'ERROR' | 'CRITICAL';

type ReportOptions = {
  level?: Level;
  isFatal?: boolean;
  screen?: string;
  context?: Record<string, unknown>;
};

let currentUserId: number | null = null;
let appVersion: string | null = null;
let currentScreen: string | null = null;

// Avoid flooding the API if the same error fires in a render loop.
const recent = new Map<string, number>();
const DEDUPE_MS = 10_000;

/** Call after login / logout so reports are linked to the user. */
export function setErrorUser(userId: number | null) {
  currentUserId = userId;
}

/** Optional: call when the visible screen changes. */
export function setErrorScreen(screen: string | null) {
  currentScreen = screen;
}

export function setAppVersion(version: string | null) {
  appVersion = version;
}

function normalise(error: unknown): { message: string; type: string | null; stack: string | null } {
  if (error instanceof Error) {
    return { message: error.message || error.name, type: error.name || null, stack: error.stack ?? null };
  }
  if (typeof error === 'string') return { message: error, type: null, stack: null };
  try {
    return { message: JSON.stringify(error), type: typeof error, stack: null };
  } catch {
    return { message: String(error), type: typeof error, stack: null };
  }
}

/** Report an error. Never throws, and never blocks the UI. */
export async function reportError(error: unknown, options: ReportOptions = {}): Promise<void> {
  try {
    const { message, type, stack } = normalise(error);
    const screen = options.screen ?? currentScreen ?? undefined;

    const key = `${type}|${message}|${screen}`;
    const now = Date.now();
    if (now - (recent.get(key) ?? 0) < DEDUPE_MS) return;
    recent.set(key, now);

    if (__DEV__) console.log('[errorReporter] reporting', type, message);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    await fetch(`${API_URL}/errors/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        message: message.slice(0, 10_000),
        error_type: type,
        stack_trace: stack?.slice(0, 50_000) ?? null,
        level: options.level ?? 'ERROR',
        is_fatal: options.isFatal ?? false,
        platform: Platform.OS,
        app_version: appVersion,
        screen,
        user_id: currentUserId,
        context: options.context ?? null,
      }),
    }).finally(() => clearTimeout(timeout));
  } catch {
    // Reporting failed (offline, API down). Swallow it: the reporter must never crash the app.
  }
}

let installed = false;

/**
 * Catches JS errors that nothing else handled (including fatal crashes)
 * and reports them. Call once, as early as possible (top of App.tsx).
 */
export function installGlobalErrorHandler() {
  if (installed) return;
  installed = true;

  const errorUtils = (globalThis as any).ErrorUtils;
  if (!errorUtils?.setGlobalHandler) return;

  const previous = errorUtils.getGlobalHandler?.();
  errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    reportError(error, { isFatal: !!isFatal, level: isFatal ? 'CRITICAL' : 'ERROR' });
    previous?.(error, isFatal); // keep React Native's default behaviour (red box / crash)
  });
}
