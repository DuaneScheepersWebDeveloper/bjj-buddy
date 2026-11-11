import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import { Avatar } from '../components/Avatar';
import { BeltBadge, MAX_STRIPES, formatRank } from '../components/BeltBadge';
import { PrimaryButton } from '../components/PrimaryButton';
import { TechniqueIcon } from '../components/TechniqueIcon';
import { belts, radius, space } from '../theme';
import { makeStyles, useTheme } from '../ThemeContext';
import {
  ATTIRE_LABEL,
  CATEGORY_ONE,
  POSITION_LABEL,
  SESSION_TYPE_LABEL,
  dateLabel,
  formatDuration,
  type TrainingSession,
} from '../sessions/types';

const BELT_ORDER = ['White', 'Blue', 'Purple', 'Brown', 'Black'] as const;
const COACH_BLUE = '#2E7DD7';
const MAX_NOTE = 1000;

type Student = {
  id: number;
  full_name: string;
  username: string | null;
  avatar_url: string | null;
  belt_rank: string;
  stripes: number;
  gym: string | null;
  role: string;
  sessions_30d: number;
  last_trained_on: string | null;
};

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

/** Coaches: your gym's students. Tap one to promote them, read their sessions and leave notes. */
export function StudentsScreen({ onBack }: { onBack: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { user, request } = useAuth();
  const [students, setStudents] = useState<Student[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setStudents(await request<Student[]>('/coach/students', { timeoutMs: 10000 }));
    } catch (e) {
      setError(errorText(e));
    }
  }, [request]);

  useEffect(() => {
    load();
  }, [load]);

  const open = students?.find((s) => s.id === openId) ?? null;
  if (open) {
    return (
      <StudentDetail
        student={open}
        onBack={() => setOpenId(null)}
        onChanged={(s) => setStudents((list) => list?.map((x) => (x.id === s.id ? s : x)) ?? null)}
      />
    );
  }

  const term = search.trim().toLowerCase();
  const shown = (students ?? []).filter(
    (s) => !term || s.full_name.toLowerCase().includes(term) || (s.username ?? '').toLowerCase().includes(term),
  );

  return (
    <View>
      <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" style={styles.back}>
        <Text style={styles.backText}>‹ Home</Text>
      </Pressable>
      <Text style={styles.title}>Students</Text>
      <Text style={styles.subtitle}>
        {user?.role === 'admin' ? 'Everyone (you’re an admin)' : user?.gym ? `Training at ${user.gym}` : ''}
      </Text>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={load} hitSlop={8} accessibilityRole="button">
            <Text style={styles.retry}>Try again</Text>
          </Pressable>
        </View>
      ) : null}

      {students === null && !error ? <ActivityIndicator color={colors.text} style={styles.loading} /> : null}

      {students && students.length > 5 ? (
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search students"
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          style={styles.search}
        />
      ) : null}

      {students && students.length === 0 ? (
        <View style={[styles.card, styles.empty]}>
          <Text style={styles.emptyTitle}>No students yet</Text>
          <Text style={styles.emptyText}>
            Students show up here when the gym on their profile matches yours ({user?.gym || 'add your gym in Profile'}).
          </Text>
        </View>
      ) : null}

      {shown.map((s) => (
        <Pressable
          key={s.id}
          onPress={() => setOpenId(s.id)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.card, styles.row, pressed && styles.pressed]}
        >
          <Avatar url={s.avatar_url} name={s.full_name} belt={s.belt_rank} size={46} />
          <View style={styles.flex}>
            <Text style={styles.name} numberOfLines={1}>
              {s.full_name}
            </Text>
            <Text style={styles.meta}>{formatRank(s.belt_rank, s.stripes)}</Text>
            <Text style={styles.meta}>
              {s.sessions_30d} session{s.sessions_30d === 1 ? '' : 's'} in 30 days
              {s.last_trained_on ? ` · last ${dateLabel(s.last_trained_on)}` : ''}
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      ))}
    </View>
  );
}

function StudentDetail({ student, onBack, onChanged }: { student: Student; onBack: () => void; onChanged: (s: Student) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { request } = useAuth();
  const [belt, setBelt] = useState(student.belt_rank);
  const [stripes, setStripes] = useState(student.stripes);
  const [saving, setSaving] = useState(false);
  const [rankMsg, setRankMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sessions, setSessions] = useState<TrainingSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openSession, setOpenSession] = useState<string | null>(null);

  useEffect(() => {
    request<TrainingSession[]>(`/coach/students/${student.id}/sessions?limit=50`, { timeoutMs: 10000 })
      .then(setSessions)
      .catch((e) => setError(errorText(e)));
  }, [request, student.id]);

  const changed = belt !== student.belt_rank || stripes !== student.stripes;

  async function promote() {
    setSaving(true);
    setRankMsg(null);
    try {
      const updated = await request<Student>(`/coach/students/${student.id}/rank`, {
        method: 'PATCH',
        body: { belt_rank: belt, stripes },
      });
      onChanged(updated);
      setRankMsg({ ok: true, text: `Saved: ${formatRank(updated.belt_rank, updated.stripes)}` });
    } catch (e) {
      setRankMsg({ ok: false, text: errorText(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <View>
      <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" style={styles.back}>
        <Text style={styles.backText}>‹ Students</Text>
      </Pressable>

      <View style={[styles.card, styles.row]}>
        <Avatar url={student.avatar_url} name={student.full_name} belt={student.belt_rank} size={60} />
        <View style={styles.flex}>
          <Text style={styles.bigName} numberOfLines={1}>
            {student.full_name}
          </Text>
          {student.username ? <Text style={styles.meta}>@{student.username}</Text> : null}
        </View>
        <BeltBadge belt={student.belt_rank} stripes={student.stripes} size="md" />
      </View>

      {/* Promote */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Belt and stripes</Text>
        <View style={styles.beltRow}>
          {BELT_ORDER.map((b) => (
            <Pressable
              key={b}
              onPress={() => {
                setBelt(b);
                if (b !== student.belt_rank) setStripes(0);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: belt === b }}
              accessibilityLabel={`${b} belt`}
              style={[styles.beltChip, belt === b && styles.beltChipOn]}
            >
              <View style={[styles.beltSwatch, { backgroundColor: b === 'White' ? colors.whiteBelt : belts[b] }]} />
              <Text style={[styles.beltText, belt === b && styles.beltTextOn]}>{b}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.stripeRow}>
          <Text style={styles.meta}>Stripes</Text>
          <View style={styles.stepper}>
            <Pressable
              onPress={() => setStripes((n) => Math.max(0, n - 1))}
              disabled={stripes <= 0}
              accessibilityRole="button"
              accessibilityLabel="One stripe less"
              style={[styles.round, stripes <= 0 && styles.dim]}
            >
              <Text style={styles.roundText}>−</Text>
            </Pressable>
            <Text style={styles.stripeNum}>{stripes}</Text>
            <Pressable
              onPress={() => setStripes((n) => Math.min(MAX_STRIPES, n + 1))}
              disabled={stripes >= MAX_STRIPES}
              accessibilityRole="button"
              accessibilityLabel="One stripe more"
              style={[styles.round, stripes >= MAX_STRIPES && styles.dim]}
            >
              <Text style={styles.roundText}>+</Text>
            </Pressable>
          </View>
        </View>
        {rankMsg ? <Text style={[styles.msg, { color: rankMsg.ok ? colors.success : colors.danger }]}>{rankMsg.text}</Text> : null}
        {changed ? (
          <PrimaryButton title={`Promote to ${formatRank(belt, stripes)}`} onPress={promote} loading={saving} />
        ) : null}
      </View>

      {/* Sessions */}
      <Text style={styles.sectionLabel}>SESSIONS</Text>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {sessions === null && !error ? <ActivityIndicator color={colors.text} style={styles.loading} /> : null}
      {sessions && sessions.length === 0 ? <Text style={styles.meta}>No sessions logged yet.</Text> : null}
      {sessions?.map((s) => (
        <SessionCard
          key={s.id}
          session={s}
          open={openSession === s.id}
          onToggle={() => setOpenSession((id) => (id === s.id ? null : s.id))}
          onSaved={(updated) => setSessions((list) => list?.map((x) => (x.id === updated.id ? updated : x)) ?? null)}
        />
      ))}
    </View>
  );
}

function SessionCard({
  session: s,
  open,
  onToggle,
  onSaved,
}: {
  session: TrainingSession;
  open: boolean;
  onToggle: () => void;
  onSaved: (s: TrainingSession) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { user, request } = useAuth();
  const mine = s.coach_notes?.find((n) => n.coach_id === user?.id);
  const others = (s.coach_notes ?? []).filter((n) => n.coach_id !== user?.id);
  const [note, setNote] = useState(mine?.text ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => setNote(mine?.text ?? ''), [mine?.text]);

  async function saveNote(text: string) {
    setBusy(true);
    setMsg(null);
    try {
      const updated = await request<TrainingSession>(`/coach/sessions/${s.id}/note`, { method: 'PUT', body: { text } });
      onSaved(updated);
      setMsg({ ok: true, text: text.trim() ? 'Note saved. They’ll see it on this session.' : 'Note removed.' });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  const hits = s.entries.filter((e) => e.result === 'hit');
  const taps = s.entries.filter((e) => e.result === 'conceded');

  return (
    <View style={styles.card}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.row}>
        <View style={styles.flex}>
          <Text style={styles.date}>{dateLabel(s.trained_on)}</Text>
          <Text style={styles.name} numberOfLines={1}>
            {s.location || SESSION_TYPE_LABEL[s.session_type]}
          </Text>
          <Text style={styles.meta}>
            {ATTIRE_LABEL[s.attire]} · {SESSION_TYPE_LABEL[s.session_type]} · {formatDuration(s.duration_min)}
          </Text>
          {mine ? <Text style={styles.noteFlag}>● You left a note</Text> : null}
        </View>
        <Text style={styles.score}>
          <Text style={{ color: colors.success }}>{s.subs_for}</Text>
          <Text style={styles.meta}> – </Text>
          <Text style={{ color: colors.danger }}>{s.subs_against}</Text>
        </Text>
        <Text style={styles.chevron}>{open ? '⌄' : '›'}</Text>
      </Pressable>

      {open ? (
        <View style={styles.detail}>
          <Section title="Went right" text={s.went_right} />
          <Entries list={hits} color={colors.success} />
          <Section title="Went wrong" text={s.went_wrong} />
          <Entries list={taps} color={colors.danger} received />
          <Section title="Working on" text={s.to_improve} />

          {others.map((n) => (
            <View key={n.coach_id} style={styles.otherNote}>
              <Text style={styles.detailLabel}>NOTE FROM {n.coach_name.toUpperCase()}</Text>
              <Text style={styles.body}>{n.text}</Text>
            </View>
          ))}

          <Text style={[styles.detailLabel, { color: COACH_BLUE }]}>YOUR NOTE</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="e.g. Great frames today. Next: keep your elbows tight when they pass."
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.accent}
            multiline
            maxLength={MAX_NOTE}
            textAlignVertical="top"
            style={styles.noteInput}
          />
          {msg ? <Text style={[styles.msg, { color: msg.ok ? colors.success : colors.danger }]}>{msg.text}</Text> : null}
          <View style={styles.noteActions}>
            {mine ? (
              <Pressable onPress={() => saveNote('')} disabled={busy} hitSlop={8} accessibilityRole="button">
                <Text style={styles.remove}>Remove note</Text>
              </Pressable>
            ) : (
              <View />
            )}
            <Pressable
              onPress={() => saveNote(note)}
              disabled={busy || !note.trim() || note.trim() === mine?.text}
              accessibilityRole="button"
              style={[styles.saveNote, (busy || !note.trim() || note.trim() === mine?.text) && styles.dim]}
            >
              <Text style={styles.saveNoteText}>{busy ? 'Saving…' : mine ? 'Update note' : 'Save note'}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Section({ title, text }: { title: string; text: string | null }) {
  const styles = useStyles();
  if (!text?.trim()) return null;
  return (
    <>
      <Text style={styles.detailLabel}>{title.toUpperCase()}</Text>
      <Text style={styles.body}>{text}</Text>
    </>
  );
}

function Entries({ list, color, received }: { list: TrainingSession['entries']; color: string; received?: boolean }) {
  const styles = useStyles();
  if (list.length === 0) return null;
  return (
    <View style={styles.entries}>
      {list.map((e) => (
        <View key={`${e.result}:${e.name}`} style={[styles.entry, { borderColor: color }]}>
          <TechniqueIcon technique={e} size={22} received={received} />
          <View>
            <Text style={styles.entryName}>
              {e.name}
              {e.count > 1 ? ` ×${e.count}` : ''}
            </Text>
            <Text style={styles.entryMeta}>
              {CATEGORY_ONE[e.category]} · {POSITION_LABEL[e.position]}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  dim: { opacity: 0.4 },
  loading: { marginVertical: space(6) },
  back: { alignSelf: 'flex-start', paddingVertical: space(1), marginBottom: space(3) },
  backText: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
  title: { color: colors.text, fontSize: 30, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: 15, marginTop: space(1), marginBottom: space(5) },
  search: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    marginBottom: space(4),
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(4),
    marginBottom: space(3),
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  name: { color: colors.text, fontSize: 16, fontWeight: '800' },
  bigName: { color: colors.text, fontSize: 20, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  date: { color: colors.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  chevron: { color: colors.textMuted, fontSize: 22 },
  score: { fontSize: 20, fontWeight: '900' },
  empty: { alignItems: 'center' },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: space(1) },
  errorBox: { backgroundColor: colors.dangerSurface, borderRadius: radius.md, padding: space(4), marginBottom: space(4), gap: space(2) },
  errorText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  retry: { color: colors.text, fontSize: 14, fontWeight: '800' },

  cardTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: space(3) },
  beltRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginBottom: space(4) },
  beltChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    paddingHorizontal: space(3),
    paddingVertical: space(2),
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  beltChipOn: { borderColor: colors.text, backgroundColor: colors.surfaceRaised },
  beltSwatch: { width: 18, height: 8, borderRadius: 2, borderWidth: 1, borderColor: colors.border },
  beltText: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
  beltTextOn: { color: colors.text },
  stripeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space(4) },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  round: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  roundText: { color: colors.text, fontSize: 20, fontWeight: '700', lineHeight: 22 },
  stripeNum: { color: colors.text, fontSize: 22, fontWeight: '900', minWidth: 20, textAlign: 'center' },
  msg: { fontSize: 14, fontWeight: '700', marginBottom: space(3) },

  sectionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginTop: space(3), marginBottom: space(2) },
  noteFlag: { color: COACH_BLUE, fontSize: 12, fontWeight: '700', marginTop: space(1) },
  detail: { marginTop: space(3), paddingTop: space(3), borderTopWidth: 1, borderTopColor: colors.border },
  detailLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginTop: space(3), marginBottom: space(1) },
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
  entries: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginTop: space(2) },
  entry: { flexDirection: 'row', alignItems: 'center', gap: space(2), borderWidth: 1.5, borderRadius: radius.sm, paddingHorizontal: space(2), paddingVertical: space(1) },
  entryName: { color: colors.text, fontSize: 13, fontWeight: '700' },
  entryMeta: { color: colors.textMuted, fontSize: 11 },
  otherNote: { marginTop: space(1) },
  noteInput: {
    minHeight: 90,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1.5,
    borderColor: COACH_BLUE,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
    padding: space(3),
    marginBottom: space(3),
  },
  noteActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  remove: { color: colors.danger, fontSize: 14, fontWeight: '700' },
  saveNote: { backgroundColor: COACH_BLUE, paddingHorizontal: space(5), paddingVertical: space(2) + 2, borderRadius: radius.sm },
  saveNoteText: { color: colors.white, fontSize: 14, fontWeight: '800' },
}));
