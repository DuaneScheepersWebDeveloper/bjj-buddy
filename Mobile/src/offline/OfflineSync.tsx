import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { ApiError, isNetworkError } from '../lib/api';
import {
  addItem,
  flush,
  isRetryable,
  loadOutbox,
  newId,
  saveOutbox,
  type NewOutboxItem,
  type OutboxItem,
} from './outbox';

const RETRY_EVERY_MS = 20_000; // while changes are waiting and the app is open
const QUICK_TIMEOUT_MS = 8_000; // weak gym signal: don't keep the user waiting

export type SendResult<T> = { status: 'sent'; data: T } | { status: 'queued' };
export type UploadListener = (item: OutboxItem, response: unknown) => void;

type OfflineSyncState = {
  /** Changes saved on this phone, waiting to upload. */
  pending: OutboxItem[];
  /** Changes the server refused; shown so the user can see what happened. */
  failed: OutboxItem[];
  syncing: boolean;
  /** The last attempt couldn't reach the server. */
  offline: boolean;
  /** Bumped when a sync uploads something (lets the UI flash "All changes uploaded"). */
  lastUploadAt: number | null;
  /**
   * Try to send now; if the phone is offline (or the server is unreachable), save it
   * in the outbox to send later. Throws only if the server rejects it (e.g. invalid data).
   */
  sendOrQueue: <T>(item: NewOutboxItem) => Promise<SendResult<T>>;
  /**
   * Always save to the outbox first (shows up instantly, online or not), then upload in the
   * background. Use with `onUploaded` to update the screen with the server's answer.
   */
  queue: (item: NewOutboxItem) => Promise<void>;
  /** Called each time a queued item uploads successfully. Returns an unsubscribe function. */
  onUploaded: (listener: UploadListener) => () => void;
  syncNow: () => Promise<void>;
  retryFailed: (id: string) => Promise<void>;
  dismissFailed: (id: string) => Promise<void>;
};

const Ctx = createContext<OfflineSyncState | null>(null);

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const { user, request, refreshUser } = useAuth();
  const userId = user?.id ?? null;

  const [items, setItems] = useState<OutboxItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [lastUploadAt, setLastUploadAt] = useState<number | null>(null);

  const itemsRef = useRef<OutboxItem[]>([]);
  const listeners = useRef(new Set<UploadListener>());
  const busy = useRef(false);
  const userRef = useRef<number | null>(null);

  const commit = useCallback(async (next: OutboxItem[]) => {
    itemsRef.current = next;
    setItems(next);
    if (userRef.current != null) await saveOutbox(userRef.current, next);
  }, []);

  const send = useCallback(
    async (item: OutboxItem) => {
      const response = await request(item.path, {
        method: item.method,
        body: item.body,
        headers: { 'Idempotency-Key': item.id },
        timeoutMs: QUICK_TIMEOUT_MS,
      });
      listeners.current.forEach((l) => {
        try {
          l(item, response);
        } catch {
          // a screen's listener failing must not stop the upload
        }
      });
      return response;
    },
    [request],
  );

  const syncNow = useCallback(async () => {
    if (busy.current || userRef.current == null) return;
    if (!itemsRef.current.some((x) => x.state === 'pending')) return;
    busy.current = true;
    setSyncing(true);
    try {
      const result = await flush(itemsRef.current, send, (progress) => {
        itemsRef.current = progress;
        setItems(progress);
      });
      await commit(result.items);
      setOffline(result.offline);
      if (result.sent > 0) {
        setLastUploadAt(Date.now());
        refreshUser().catch(() => {}); // pick up the server's view of anything we changed
      }
    } finally {
      busy.current = false;
      setSyncing(false);
    }
  }, [send, commit, refreshUser]);

  // Load this user's outbox when they sign in (and clear the view when they sign out).
  useEffect(() => {
    userRef.current = userId;
    if (userId == null) {
      itemsRef.current = [];
      setItems([]);
      return;
    }
    let cancelled = false;
    loadOutbox(userId).then((saved) => {
      if (cancelled) return;
      itemsRef.current = saved;
      setItems(saved);
      syncNow();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Try again whenever the app comes back to the foreground...
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') syncNow();
    });
    return () => sub.remove();
  }, [syncNow]);

  // ...and every so often while something is waiting.
  const hasPending = items.some((x) => x.state === 'pending');
  useEffect(() => {
    if (!hasPending) return;
    const t = setInterval(() => {
      if (AppState.currentState === 'active' || AppState.currentState == null) syncNow();
    }, RETRY_EVERY_MS);
    return () => clearInterval(t);
  }, [hasPending, syncNow]);

  const enqueue = useCallback(
    async (input: NewOutboxItem) => {
      await commit(addItem(itemsRef.current, input));
    },
    [commit],
  );

  const sendOrQueue = useCallback(
    async <T,>(input: NewOutboxItem): Promise<SendResult<T>> => {
      // Keep things in order: if older changes are still waiting, this one waits behind them.
      if (itemsRef.current.some((x) => x.state === 'pending')) {
        await enqueue(input);
        syncNow();
        return { status: 'queued' };
      }
      const id = newId();
      try {
        const data = await request<T>(input.path, {
          method: input.method,
          body: input.body,
          headers: { 'Idempotency-Key': id },
          timeoutMs: QUICK_TIMEOUT_MS,
        });
        setOffline(false);
        return { status: 'sent', data };
      } catch (err) {
        if (isRetryable(err) && !(err instanceof ApiError && err.status === 401)) {
          await commit(addItem(itemsRef.current, input, id));
          setOffline(isNetworkError(err));
          return { status: 'queued' };
        }
        throw err;
      }
    },
    [request, enqueue, commit, syncNow],
  );

  const queue = useCallback(
    async (input: NewOutboxItem) => {
      await enqueue(input);
      syncNow();
    },
    [enqueue, syncNow],
  );

  const onUploaded = useCallback((listener: UploadListener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const retryFailed = useCallback(
    async (id: string) => {
      await commit(itemsRef.current.map((x) => (x.id === id ? { ...x, state: 'pending' as const, attempts: 0 } : x)));
      await syncNow();
    },
    [commit, syncNow],
  );

  const dismissFailed = useCallback(
    async (id: string) => {
      await commit(itemsRef.current.filter((x) => x.id !== id));
    },
    [commit],
  );

  const value = useMemo<OfflineSyncState>(
    () => ({
      pending: items.filter((x) => x.state === 'pending'),
      failed: items.filter((x) => x.state === 'failed'),
      syncing,
      offline,
      lastUploadAt,
      sendOrQueue,
      queue,
      onUploaded,
      syncNow,
      retryFailed,
      dismissFailed,
    }),
    [items, syncing, offline, lastUploadAt, sendOrQueue, queue, onUploaded, syncNow, retryFailed, dismissFailed],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOfflineSync(): OfflineSyncState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useOfflineSync must be used inside <OfflineSyncProvider>');
  return ctx;
}
