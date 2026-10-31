import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../auth/AuthContext';
import { useOfflineSync } from '../offline/OfflineSync';
import type { OutboxItem } from '../offline/outbox';
import { BUILT_IN_TECHNIQUES } from '../data/techniques';
import { tally, type SessionDraft, type Technique, type TrainingSession } from './types';

const PATH = '/sessions';
const sessionsKey = (userId: number) => `bjjbuddy.sessions.v1.${userId}`;
const techniquesKey = (userId: number) => `bjjbuddy.techniques.v1.${userId}`;

type SessionsState = {
  /** Your sessions, newest first, including ones saved on this phone that haven't uploaded yet. */
  sessions: TrainingSession[];
  /** False until the copy saved on this phone has been read. */
  ready: boolean;
  /** Built-in techniques plus your own (including ones only used in sessions not uploaded yet). */
  techniques: Technique[];
  /** Save a new or edited session. Works offline: it uploads when there's signal. */
  saveSession: (draft: SessionDraft) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<SessionsState | null>(null);

function sortSessions(list: TrainingSession[]): TrainingSession[] {
  return [...list].sort(
    (a, b) => b.trained_on.localeCompare(a.trained_on) || b.created_at.localeCompare(a.created_at),
  );
}

function fromDraft(draft: SessionDraft, updatedAt: string): TrainingSession {
  const { subsFor, subsAgainst } = tally(draft.entries);
  return { ...draft, subs_for: subsFor, subs_against: subsAgainst, updated_at: updatedAt, unsynced: true };
}

/** The server's list with this phone's not-yet-uploaded saves and deletes applied on top. */
function applyPending(base: TrainingSession[], pending: OutboxItem[]): TrainingSession[] {
  let list = base;
  for (const item of pending) {
    if (!item.path.startsWith(`${PATH}/`)) continue;
    const id = item.path.slice(PATH.length + 1);
    if (item.method === 'PUT') {
      const s = fromDraft({ ...(item.body as SessionDraft), id }, item.createdAt);
      list = [...list.filter((x) => x.id !== id), s];
    } else if (item.method === 'DELETE') {
      list = list.filter((x) => x.id !== id);
    }
  }
  return sortSessions(list);
}

export function SessionsProvider({ children }: { children: ReactNode }) {
  const { user, request } = useAuth();
  const { pending, queue, onUploaded } = useOfflineSync();
  const userId = user?.id ?? null;

  const [base, setBase] = useState<TrainingSession[]>([]);
  const [library, setLibrary] = useState<Technique[]>(BUILT_IN_TECHNIQUES);
  const [ready, setReady] = useState(false);

  const saveBase = useCallback(
    (update: (prev: TrainingSession[]) => TrainingSession[]) => {
      setBase((prev) => {
        const next = sortSessions(update(prev));
        if (userId != null) AsyncStorage.setItem(sessionsKey(userId), JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [userId],
  );

  const refresh = useCallback(async () => {
    if (userId == null) return;
    try {
      const [list, techniques] = await Promise.all([
        request<TrainingSession[]>(`${PATH}?limit=300`, { timeoutMs: 8000 }),
        request<Technique[]>('/techniques', { timeoutMs: 8000 }),
      ]);
      saveBase(() => list);
      setLibrary(techniques);
      AsyncStorage.setItem(techniquesKey(userId), JSON.stringify(techniques)).catch(() => {});
    } catch {
      // Offline or server down: keep showing what's saved on the phone.
    }
  }, [userId, request, saveBase]);

  // Show what's saved on this phone straight away, then fetch the latest.
  useEffect(() => {
    setReady(false);
    setBase([]);
    setLibrary(BUILT_IN_TECHNIQUES);
    if (userId == null) return;
    let cancelled = false;
    Promise.all([AsyncStorage.getItem(sessionsKey(userId)), AsyncStorage.getItem(techniquesKey(userId))])
      .then(([rawSessions, rawTechniques]) => {
        if (cancelled) return;
        if (rawSessions) setBase(JSON.parse(rawSessions) as TrainingSession[]);
        if (rawTechniques) setLibrary(JSON.parse(rawTechniques) as Technique[]);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    refresh();
    return () => {
      cancelled = true;
    };
  }, [userId, refresh]);

  // When a queued save/delete uploads, put the server's answer into the list.
  useEffect(
    () =>
      onUploaded((item, response) => {
        if (!item.path.startsWith(`${PATH}/`)) return;
        const id = item.path.slice(PATH.length + 1);
        if (item.method === 'PUT' && response && typeof response === 'object') {
          const saved = response as TrainingSession;
          saveBase((prev) => [...prev.filter((s) => s.id !== id), saved]);
        } else if (item.method === 'DELETE') {
          saveBase((prev) => prev.filter((s) => s.id !== id));
        }
      }),
    [onUploaded, saveBase],
  );

  const sessions = useMemo(() => applyPending(base, pending), [base, pending]);

  // Techniques you typed in yourself show up in the picker straight away, even offline.
  const techniques = useMemo(() => {
    const known = new Set(library.map((t) => t.name.toLowerCase()));
    const extra: Technique[] = [];
    for (const s of sessions) {
      for (const e of s.entries) {
        const key = e.name.toLowerCase();
        if (!known.has(key)) {
          known.add(key);
          extra.push({ name: e.name, category: e.category, position: e.position, custom: true });
        }
      }
    }
    return extra.length ? [...library, ...extra] : library;
  }, [library, sessions]);

  const saveSession = useCallback(
    async (draft: SessionDraft) => {
      await queue({
        path: `${PATH}/${draft.id}`,
        method: 'PUT',
        body: draft,
        label: draft.location ? `Session at ${draft.location}` : 'Training session',
        coalesceKey: `session:${draft.id}`,
      });
    },
    [queue],
  );

  const deleteSession = useCallback(
    async (id: string) => {
      await queue({ path: `${PATH}/${id}`, method: 'DELETE', label: 'Delete a session' });
    },
    [queue],
  );

  const value = useMemo(
    () => ({ sessions, ready, techniques, saveSession, deleteSession, refresh }),
    [sessions, ready, techniques, saveSession, deleteSession, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSessions(): SessionsState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSessions must be used inside <SessionsProvider>');
  return ctx;
}
