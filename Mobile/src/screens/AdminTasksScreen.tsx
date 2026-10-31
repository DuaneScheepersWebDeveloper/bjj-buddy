import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../auth/AuthContext';
import { useOfflineSync } from '../offline/OfflineSync';
import { newId, type OutboxItem } from '../offline/outbox';
import { isNetworkError } from '../lib/api';
import { Banner } from '../components/AuthLayout';
import { WeekWidget } from '../components/WeekWidget';
import { weekCounts, weekStreak } from '../lib/week';
import { radius, space } from '../theme';
import { makeStyles, useTheme } from '../ThemeContext';

type Task = {
  id: string;
  title: string;
  done: boolean;
  created_at: string;
  completed_at: string | null;
  created_by: number | null;
  created_by_name: string | null;
  /** Has changes on this phone that haven't uploaded yet (app-only). */
  unsynced?: boolean;
};

const PATH = '/admin/tasks';
const cacheKey = (userId: number) => `bjjbuddy.adminTasks.v1.${userId}`;
const goalKey = (userId: number) => `bjjbuddy.adminTasks.weeklyGoal.${userId}`;
const DEFAULT_GOAL = 5;

function sortTasks(list: Task[]): Task[] {
  const open = list.filter((t) => !t.done).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const done = list
    .filter((t) => t.done)
    .sort((a, b) => (b.completed_at ?? b.created_at).localeCompare(a.completed_at ?? a.created_at));
  return [...open, ...done];
}

/** Show the server's list with this phone's not-yet-uploaded changes applied on top. */
function applyPending(base: Task[], pending: OutboxItem[], me: { id: number; name: string }): Task[] {
  let list = [...base];
  for (const item of pending) {
    if (!item.path.startsWith(PATH)) continue;
    const id = item.path.slice(PATH.length + 1);
    const body = (item.body ?? {}) as Partial<Task>;
    if (item.method === 'POST') {
      if (!list.some((t) => t.id === body.id)) {
        list.push({
          id: body.id!,
          title: body.title ?? '',
          done: false,
          created_at: body.created_at ?? item.createdAt,
          completed_at: null,
          created_by: me.id,
          created_by_name: me.name,
          unsynced: true,
        });
      }
    } else if (item.method === 'PATCH') {
      list = list.map((t) =>
        t.id === id
          ? {
              ...t,
              ...(body.title !== undefined ? { title: body.title } : {}),
              ...(body.done !== undefined
                ? { done: body.done, completed_at: body.done ? t.completed_at ?? item.createdAt : null }
                : {}),
              unsynced: true,
            }
          : t,
      );
    } else if (item.method === 'DELETE') {
      list = list.filter((t) => t.id !== id);
    }
  }
  return sortTasks(list);
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  return days < 7 ? `${days} d ago` : new Date(iso).toLocaleDateString();
}

/** Admins' shared to-do list for ideas. Works offline: changes upload when there's signal. */
export function AdminTasksScreen({ onBack }: { onBack: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { user, request } = useAuth();
  const { pending, offline, queue, onUploaded } = useOfflineSync();
  const [base, setBase] = useState<Task[] | null>(null); // last known server list
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(true);
  const [goal, setGoal] = useState(DEFAULT_GOAL);
  const inputRef = useRef<TextInput>(null);
  const userId = user?.id ?? 0;

  const saveBase = useCallback(
    (next: Task[]) => {
      setBase(next);
      AsyncStorage.setItem(cacheKey(userId), JSON.stringify(next)).catch(() => {});
    },
    [userId],
  );

  const refresh = useCallback(async () => {
    try {
      const list = await request<Task[]>(PATH, { timeoutMs: 8000 });
      saveBase(list);
      setLoadError(null);
    } catch (err) {
      setLoadError(isNetworkError(err) ? null : err instanceof Error ? err.message : 'Could not load tasks');
    }
  }, [request, saveBase]);

  // Show the copy saved on this phone straight away, then fetch the latest.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(cacheKey(userId))
      .then((raw) => {
        if (!cancelled) setBase((b) => b ?? (raw ? (JSON.parse(raw) as Task[]) : []));
      })
      .catch(() => setBase((b) => b ?? []));
    refresh();
    return () => {
      cancelled = true;
    };
  }, [userId, refresh]);

  // When a queued task change uploads, put the server's answer into our list.
  useEffect(
    () =>
      onUploaded((item, response) => {
        if (!item.path.startsWith(PATH)) return;
        setBase((prev) => {
          let next = prev ?? [];
          if (item.method === 'DELETE') {
            const id = item.path.slice(PATH.length + 1);
            next = next.filter((t) => t.id !== id);
          } else if (response && typeof response === 'object' && 'id' in response) {
            const t = response as Task;
            next = next.some((x) => x.id === t.id) ? next.map((x) => (x.id === t.id ? t : x)) : [t, ...next];
          }
          AsyncStorage.setItem(cacheKey(userId), JSON.stringify(next)).catch(() => {});
          return next;
        });
      }),
    [onUploaded, userId],
  );

  // Weekly goal is a personal setting, remembered on this phone.
  useEffect(() => {
    AsyncStorage.getItem(goalKey(userId))
      .then((v) => {
        const n = Number(v);
        if (v && n > 0) setGoal(n);
      })
      .catch(() => {});
  }, [userId]);

  const changeGoal = (n: number) => {
    setGoal(n);
    AsyncStorage.setItem(goalKey(userId), String(n)).catch(() => {});
  };

  const me = useMemo(() => ({ id: userId, name: user?.full_name ?? '' }), [userId, user?.full_name]);
  const tasks = useMemo(() => (base ? applyPending(base, pending, me) : null), [base, pending, me]);
  const openTasks = tasks?.filter((t) => !t.done) ?? [];
  const doneTasks = tasks?.filter((t) => t.done) ?? [];
  const completedDates = useMemo(
    () => (tasks ?? []).filter((t) => t.done && t.completed_at).map((t) => t.completed_at as string),
    [tasks],
  );
  const counts = useMemo(() => weekCounts(completedDates), [completedDates]);
  const streak = useMemo(() => weekStreak(completedDates, goal), [completedDates, goal]);

  function add() {
    const title = draft.trim().replace(/\s+/g, ' ');
    if (!title) return;
    setDraft('');
    queue({
      path: PATH,
      method: 'POST',
      body: { id: newId(), title, created_at: new Date().toISOString() },
      label: `New task: ${title.length > 40 ? title.slice(0, 40) + '…' : title}`,
    });
    inputRef.current?.focus();
  }

  function toggle(t: Task) {
    queue({
      path: `${PATH}/${t.id}`,
      method: 'PATCH',
      body: { done: !t.done },
      label: `${t.done ? 'Reopened' : 'Completed'}: ${t.title.slice(0, 40)}`,
      coalesceKey: `task:${t.id}`,
    });
  }

  function saveEdit(t: Task) {
    const title = editText.trim().replace(/\s+/g, ' ');
    setEditingId(null);
    if (!title || title === t.title) return;
    queue({
      path: `${PATH}/${t.id}`,
      method: 'PATCH',
      body: { title },
      label: `Renamed task: ${title.slice(0, 40)}`,
      coalesceKey: `task:${t.id}`,
    });
  }

  function remove(t: Task) {
    if (confirmDelete !== t.id) {
      setConfirmDelete(t.id);
      setTimeout(() => setConfirmDelete((c) => (c === t.id ? null : c)), 3500);
      return;
    }
    setConfirmDelete(null);
    queue({ path: `${PATH}/${t.id}`, method: 'DELETE', label: `Deleted task: ${t.title.slice(0, 40)}` });
  }

  const renderTask = (t: Task) => (
    <View key={t.id} style={styles.task}>
      <Pressable
        onPress={() => toggle(t)}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: t.done }}
        accessibilityLabel={t.title}
        style={[styles.check, t.done && styles.checkOn]}
      >
        {t.done ? <Text style={styles.tick}>✓</Text> : null}
      </Pressable>

      <View style={styles.taskBody}>
        {editingId === t.id ? (
          <TextInput
            value={editText}
            onChangeText={setEditText}
            autoFocus
            onSubmitEditing={() => saveEdit(t)}
            onBlur={() => saveEdit(t)}
            returnKeyType="done"
            selectionColor={colors.accent}
            style={styles.editInput}
            maxLength={200}
          />
        ) : (
          <Pressable
            onPress={() => {
              setEditingId(t.id);
              setEditText(t.title);
            }}
            accessibilityRole="button"
            accessibilityHint="Tap to edit"
          >
            <Text style={[styles.taskTitle, t.done && styles.taskTitleDone]}>{t.title}</Text>
          </Pressable>
        )}
        <View style={styles.metaRow}>
          {t.unsynced ? <View style={styles.unsyncedDot} /> : null}
          <Text style={styles.meta}>
            {t.unsynced ? 'Not uploaded yet · ' : ''}
            {t.created_by_name ? `${t.created_by_name.split(' ')[0]} · ` : ''}
            {t.done && t.completed_at ? `done ${timeAgo(t.completed_at)}` : timeAgo(t.created_at)}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={() => remove(t)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={confirmDelete === t.id ? 'Confirm delete' : `Delete ${t.title}`}
        style={[styles.delete, confirmDelete === t.id && styles.deleteConfirm]}
      >
        <Text style={[styles.deleteText, confirmDelete === t.id && styles.deleteTextConfirm]}>
          {confirmDelete === t.id ? 'Delete' : '✕'}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <View>
      <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" style={styles.back}>
        <Text style={styles.backText}>‹ Home</Text>
      </Pressable>
      <Text style={styles.title}>Tasks</Text>
      <Text style={styles.hint}>Ideas and to-dos for admins. Works offline too.</Text>

      {offline ? (
        <Banner kind="info" message="You're offline. Changes are saved on this phone and will upload when you're back online." />
      ) : null}
      {loadError ? <Banner kind="error" message={loadError} /> : null}

      <WeekWidget
        title="Done this week"
        counts={counts}
        goal={goal}
        unit="task"
        streak={streak}
        onChangeGoal={changeGoal}
        accent="#2E7DD7"
      />

      <View style={styles.addRow}>
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={setDraft}
          placeholder="Add an idea or task…"
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          onSubmitEditing={add}
          submitBehavior="submit"
          returnKeyType="done"
          maxLength={200}
          style={styles.addInput}
        />
        <Pressable
          onPress={add}
          disabled={!draft.trim()}
          accessibilityRole="button"
          accessibilityLabel="Add task"
          style={({ pressed }) => [styles.addBtn, !draft.trim() && styles.addBtnOff, pressed && styles.pressed]}
        >
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>

      {tasks === null ? null : tasks.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No tasks yet</Text>
          <Text style={styles.emptyText}>Got an idea for the app? Type it above so it doesn't get lost.</Text>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            {openTasks.length === 0 ? (
              <Text style={styles.allDone}>All done. Nice work!</Text>
            ) : (
              openTasks.map(renderTask)
            )}
          </View>

          {doneTasks.length > 0 ? (
            <>
              <Pressable onPress={() => setShowDone((s) => !s)} style={styles.doneHeader} accessibilityRole="button">
                <Text style={styles.doneHeaderText}>
                  {showDone ? '▾' : '▸'} Completed ({doneTasks.length})
                </Text>
              </Pressable>
              {showDone ? <View style={styles.card}>{doneTasks.map(renderTask)}</View> : null}
            </>
          ) : null}
        </>
      )}

      <Text style={styles.footnote}>Tap a task to edit it · tap ✕ twice to delete</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  back: { alignSelf: 'flex-start', paddingVertical: space(1), marginBottom: space(3) },
  backText: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
  title: { color: colors.text, fontSize: 30, fontWeight: '800' },
  hint: { color: colors.textMuted, fontSize: 16, marginTop: space(2), marginBottom: space(5) },
  addRow: { flexDirection: 'row', gap: space(2), marginBottom: space(4) },
  addInput: {
    flex: 1,
    minHeight: 50,
    color: colors.text,
    fontSize: 16,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space(4),
  },
  addBtn: {
    minWidth: 72,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(4),
  },
  addBtnOff: { opacity: 0.45 },
  addBtnText: { color: colors.white, fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.75 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space(4),
    marginBottom: space(3),
  },
  task: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space(3),
    paddingVertical: space(3),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkOn: { backgroundColor: '#1F7A4D', borderColor: '#1F7A4D' },
  tick: { color: colors.white, fontSize: 13, fontWeight: '900' },
  taskBody: { flex: 1 },
  taskTitle: { color: colors.text, fontSize: 16, lineHeight: 22 },
  taskTitleDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  editInput: {
    color: colors.text,
    fontSize: 16,
    paddingVertical: space(1),
    borderBottomWidth: 1.5,
    borderBottomColor: colors.accent,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space(1), marginTop: 3 },
  unsyncedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.warning },
  meta: { color: colors.textMuted, fontSize: 12 },
  delete: { paddingHorizontal: space(2), paddingVertical: 2, borderRadius: radius.sm },
  deleteConfirm: { backgroundColor: colors.accent },
  deleteText: { color: colors.textMuted, fontSize: 15 },
  deleteTextConfirm: { color: colors.white, fontSize: 12, fontWeight: '800' },
  allDone: { color: colors.textMuted, fontSize: 15, paddingVertical: space(4), textAlign: 'center' },
  doneHeader: { paddingVertical: space(2), marginBottom: space(1) },
  doneHeaderText: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
  empty: {
    alignItems: 'center',
    padding: space(6),
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: space(2), lineHeight: 20 },
  footnote: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: space(3) },
}));
