import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../auth/AuthContext';
import { useOfflineSync } from '../offline/OfflineSync';
import { newId, type OutboxItem } from '../offline/outbox';
import { toYMD, type Focus, type FocusOutcome } from '../sessions/types';

/**
 * Your focus: the ONE thing you're deliberately working on.
 *
 * Why only one: deliberate practice works when attention isn't split. Picking one thing,
 * logging whether you worked on it, and reviewing it after a set number of sessions is the
 * loop the whole app is built around. Starting a new focus ends the old one (it stays in
 * your history with how it went).
 *
 * Same offline pattern as sessions: saved on the phone first, uploaded when there's signal.
 */

const PATH = '/focus';
const cacheKey = (userId: number) => `bjjbuddy.focus.v1.${userId}`;

export type FocusInput = { title: string; why?: string | null; target_sessions?: number };

type FocusState = {
  ready: boolean;
  /** The active focus, if you have one. */
  active: Focus | null;
  /** Every focus, active first, then most recently ended. */
  all: Focus[];
  /** Start a new focus. Ends the current one with `endCurrentAs` (default: parked). */
  startFocus: (input: FocusInput, endCurrentAs?: { outcome: FocusOutcome; reflection?: string | null }) => Promise<Focus>;
  /** Change the title, why or target of a focus. */
  updateFocus: (id: string, changes: Partial<Pick<Focus, 'title' | 'why' | 'target_sessions'>>) => Promise<void>;
  /** End the active focus without starting another. */
  endFocus: (id: string, outcome: FocusOutcome, reflection?: string | null) => Promise<void>;
};

const Ctx = createContext<FocusState | null>(null);

type FocusBody = Omit<Focus, 'id' | 'created_at' | 'updated_at' | 'unsynced'>;

function sortFocus(list: Focus[]): Focus[] {
  const active = list.filter((f) => !f.ended_on);
  const past = list
    .filter((f) => f.ended_on)
    .sort((a, b) => (b.ended_on as string).localeCompare(a.ended_on as string) || b.created_at.localeCompare(a.created_at));
  return [...active, ...past];
}

/** Server data with this phone's waiting changes applied, mirroring what the server will do. */
function applyPending(base: Focus[], pending: OutboxItem[]): Focus[] {
  let list = base;
  for (const item of pending) {
    if (!item.path.startsWith(`${PATH}/`) || item.method !== 'PUT') continue;
    const id = item.path.slice(PATH.length + 1);
    const body = item.body as FocusBody;
    const before = list.find((f) => f.id === id);
    const next: Focus = {
      ...body,
      id,
      created_at: before?.created_at ?? item.createdAt,
      updated_at: item.createdAt,
      unsynced: true,
    };
    list = list.filter((f) => f.id !== id);
    if (!next.ended_on) {
      // Only one active focus: the server ends any other, so show that straight away.
      list = list.map((f) =>
        f.ended_on ? f : { ...f, ended_on: next.started_on, outcome: f.outcome ?? 'parked' },
      );
    }
    list = [...list, next];
  }
  return sortFocus(list);
}

export function FocusProvider({ children }: { children: ReactNode }) {
  const { user, request } = useAuth();
  const { pending, queue, onUploaded } = useOfflineSync();
  const userId = user?.id ?? null;
  const [base, setBase] = useState<Focus[]>([]);
  const [ready, setReady] = useState(false);

  const saveBase = useCallback(
    (update: (prev: Focus[]) => Focus[]) =>
      setBase((prev) => {
        const next = sortFocus(update(prev));
        if (userId != null) AsyncStorage.setItem(cacheKey(userId), JSON.stringify(next)).catch(() => {});
        return next;
      }),
    [userId],
  );

  useEffect(() => {
    setReady(false);
    setBase([]);
    if (userId == null) return;
    let cancelled = false;
    AsyncStorage.getItem(cacheKey(userId))
      .then((raw) => {
        const saved = raw ? JSON.parse(raw) : null;
        if (!cancelled && Array.isArray(saved)) setBase(saved as Focus[]);
      })
      .catch(() => {})
      .finally(() => !cancelled && setReady(true));
    request<Focus[]>(PATH, { timeoutMs: 8000 })
      .then((list) => !cancelled && Array.isArray(list) && saveBase(() => list))
      .catch(() => {}); // offline: keep what's on the phone
    return () => {
      cancelled = true;
    };
  }, [userId, request, saveBase]);

  useEffect(
    () =>
      onUploaded((item, response) => {
        if (!item.path.startsWith(`${PATH}/`) || item.method !== 'PUT' || !response) return;
        const saved = response as Focus;
        saveBase((prev) => {
          let list = prev.filter((f) => f.id !== saved.id);
          if (!saved.ended_on) {
            list = list.map((f) => (f.ended_on ? f : { ...f, ended_on: saved.started_on, outcome: f.outcome ?? 'parked' }));
          }
          return [...list, saved];
        });
      }),
    [onUploaded, saveBase],
  );

  const all = useMemo(() => applyPending(base, pending), [base, pending]);
  const active = all.find((f) => !f.ended_on) ?? null;

  const put = useCallback(
    (id: string, body: FocusBody, label: string) =>
      queue({ path: `${PATH}/${id}`, method: 'PUT', body, label, coalesceKey: `focus:${id}` }),
    [queue],
  );

  const bodyOf = (f: Focus): FocusBody => ({
    title: f.title,
    why: f.why,
    target_sessions: f.target_sessions,
    started_on: f.started_on,
    ended_on: f.ended_on,
    outcome: f.outcome,
    reflection: f.reflection,
  });

  const endFocus = useCallback(
    async (id: string, outcome: FocusOutcome, reflection?: string | null) => {
      const f = all.find((x) => x.id === id);
      if (!f) return;
      const today = toYMD(new Date());
      await put(
        id,
        { ...bodyOf(f), ended_on: today < f.started_on ? f.started_on : today, outcome, reflection: reflection?.trim() || null },
        `Focus: ${f.title} (${outcome === 'got_it' ? 'done' : 'ended'})`,
      );
    },
    [all, put],
  );

  const startFocus = useCallback(
    async (input: FocusInput, endCurrentAs?: { outcome: FocusOutcome; reflection?: string | null }) => {
      if (active) await endFocus(active.id, endCurrentAs?.outcome ?? 'parked', endCurrentAs?.reflection);
      const now = new Date();
      const focus: Focus = {
        id: newId(),
        title: input.title.trim().replace(/\s+/g, ' '),
        why: input.why?.trim() || null,
        target_sessions: input.target_sessions ?? 8,
        started_on: toYMD(now),
        ended_on: null,
        outcome: null,
        reflection: null,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      };
      await put(focus.id, bodyOf(focus), `New focus: ${focus.title}`);
      return focus;
    },
    [active, endFocus, put],
  );

  const updateFocus = useCallback(
    async (id: string, changes: Partial<Pick<Focus, 'title' | 'why' | 'target_sessions'>>) => {
      const f = all.find((x) => x.id === id);
      if (!f) return;
      await put(id, { ...bodyOf(f), ...changes }, `Focus: ${changes.title ?? f.title}`);
    },
    [all, put],
  );

  const value = useMemo(
    () => ({ ready, active, all, startFocus, updateFocus, endFocus }),
    [ready, active, all, startFocus, updateFocus, endFocus],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFocus(): FocusState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useFocus must be used inside <FocusProvider>');
  return ctx;
}
