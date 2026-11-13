import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError } from '../lib/api';

/**
 * The offline outbox: changes made while the phone can't reach the server are
 * saved here (on the device, so they survive closing the app) and sent later,
 * in the order they were made.
 *
 * Each item carries a random id that's sent as the Idempotency-Key header, so if
 * the connection drops halfway through, the retry can't be applied twice.
 */
export type OutboxItem = {
  id: string;
  path: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Shown to the user, e.g. "Profile changes" or "Session at Gracie Barra". */
  label: string;
  /** When the user made the change (not when it was uploaded). */
  createdAt: string;
  /** Items with the same key are merged while waiting (e.g. several profile edits become one). */
  coalesceKey?: string;
  attempts: number;
  lastError?: string;
  /** 'failed' = the server refused it (e.g. invalid data); it won't be retried automatically. */
  state: 'pending' | 'failed';
};

export type NewOutboxItem = Pick<OutboxItem, 'path' | 'method' | 'body' | 'label' | 'coalesceKey'>;

const storageKey = (userId: number) => `bjjbuddy.outbox.v1.${userId}`;

export async function loadOutbox(userId: number): Promise<OutboxItem[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as OutboxItem[]) : [];
  } catch {
    return [];
  }
}

export async function saveOutbox(userId: number, items: OutboxItem[]): Promise<void> {
  try {
    if (items.length === 0) await AsyncStorage.removeItem(storageKey(userId));
    else await AsyncStorage.setItem(storageKey(userId), JSON.stringify(items));
  } catch {
    // Storage full or unavailable: nothing more we can do; the item stays in memory for this launch.
  }
}

/** Random id like "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed". */
export function newId(): string {
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${hex(3)}-${hex(12)}`;
}

/** Add a change to the list (merging it into a waiting change with the same coalesceKey). */
export function addItem(items: OutboxItem[], input: NewOutboxItem, id = newId()): OutboxItem[] {
  if (input.coalesceKey) {
    const i = items.findIndex((x) => x.state === 'pending' && x.coalesceKey === input.coalesceKey);
    if (i >= 0) {
      const merged: OutboxItem = {
        ...items[i],
        id, // new content, so a new key
        label: input.label,
        body:
          typeof items[i].body === 'object' && typeof input.body === 'object'
            ? { ...(items[i].body as object), ...(input.body as object) }
            : input.body,
      };
      return items.map((x, j) => (j === i ? merged : x));
    }
  }
  return [...items, { ...input, id, createdAt: new Date().toISOString(), attempts: 0, state: 'pending' }];
}

/** Should we keep the item and try again later, rather than give up on it? */
export function isRetryable(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  return err.status === 0 || err.status === 401 || err.status === 408 || err.status === 429 || err.status >= 500;
}

export type FlushResult = { sent: number; offline: boolean };
/** A change to the outbox, applied to whatever the list holds at that moment. */
export type OutboxChange = (latest: OutboxItem[]) => OutboxItem[];

/**
 * Send waiting items in order. Stops at the first one that can't be sent right now
 * (offline / server trouble) so later changes never overtake earlier ones.
 * Items the server rejects are marked 'failed' and skipped.
 *
 * Works on the LIVE list (getItems), not a copy: changes made while uploading (a new save,
 * or an edit merged into a waiting one) are picked up in this same run and never lost.
 */
export async function flush(
  getItems: () => OutboxItem[],
  send: (item: OutboxItem) => Promise<unknown>,
  apply: (change: OutboxChange) => void,
): Promise<FlushResult> {
  let sent = 0;
  const tried = new Set<string>();
  for (;;) {
    const item = getItems().find((x) => x.state === 'pending' && !tried.has(x.id));
    if (!item) return { sent, offline: false };
    tried.add(item.id);
    try {
      await send(item);
      apply((latest) => latest.filter((x) => x.id !== item.id));
      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isRetryable(err)) {
        apply((latest) => latest.map((x) => (x.id === item.id ? { ...x, attempts: x.attempts + 1, lastError: message } : x)));
        const offline = err instanceof ApiError && err.status === 0;
        return { sent, offline };
      }
      apply((latest) => latest.map((x) => (x.id === item.id ? { ...x, state: 'failed', lastError: message } : x)));
    }
  }
}
