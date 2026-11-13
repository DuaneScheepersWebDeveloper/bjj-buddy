import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../auth/AuthContext';
import { useSessions } from '../sessions/SessionsContext';
import { useFocus } from '../focus/FocusContext';
import { newId } from '../offline/outbox';
import { PrimaryButton } from '../components/PrimaryButton';
import { TechniquePicker } from '../components/TechniquePicker';
import { VoiceNote, type VoiceDump } from '../components/VoiceNote';
import { Chip, EnergyPicker, FeedbackList, FocusCheck, PartnerPicker, recentPartnerNames } from '../components/Reflection';
import { BackLink, DayPicker, RecentPlaces } from './LogSessionScreen';
import { feedbackFor, focusProgress, type Feedback } from '../insights/insights';
import { radius, space } from '../theme';
import { makeStyles, useTheme } from '../ThemeContext';
import {
  ATTIRE_LABEL,
  SESSION_TYPES,
  SESSION_TYPE_LABEL,
  dayLabel,
  formatDuration,
  tally,
  toYMD,
  type Category,
  type Entry,
  type PartnerOutcome,
  type PartnerTrait,
  type Position,
  type SessionDraft,
  type TrainingSession,
} from '../sessions/types';

const quickKey = (userId: number) => `bjjbuddy.quickDraft.v1.${userId}`;
const fullKey = (userId: number) => `bjjbuddy.sessionDraft.v1.${userId}`; // the full log's unfinished draft
const DURATIONS = [45, 60, 90, 120];
const OTHER: Category[] = ['pass', 'sweep', 'escape', 'takedown', 'position'];

type Props = {
  onDone: () => void;
  /** Open the 4-step log (this screen hands over what you've entered first). */
  onFullLog: () => void;
  /** Open the Focus page (to set one if you haven't). */
  onFocus: () => void;
  scrollToTop: () => void;
};

/**
 * Quick Log: the whole session on one screen, built to take under a minute.
 *
 * - Smart defaults: where, how long and Gi/No-Gi come from your last session, so most days
 *   you don't touch them.
 * - Talk it through: one voice recording fills in the rest (needs the server + OpenAI).
 * - The reflection is the point: did you work on your focus, what worked, what didn't,
 *   energy, who you rolled with, and ONE thing to change next time.
 * - Need more? "Full log" carries everything over to the detailed 4-step log.
 */
export function QuickLogScreen({ onDone, onFullLog, onFocus, scrollToTop }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const { sessions, techniques, saveSession } = useSessions();
  const { active: focus } = useFocus();

  const [draft, setDraft] = useState<SessionDraft | null>(null);
  const [editDetails, setEditDetails] = useState(false);
  const [showOther, setShowOther] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ session: TrainingSession; feedback: Feedback[] } | null>(null);

  const usage = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of sessions) for (const e of s.entries) counts[e.name.toLowerCase()] = (counts[e.name.toLowerCase()] ?? 0) + e.count;
    return counts;
  }, [sessions]);
  const partnerHistory = useMemo(() => sessions.map((s) => s.partners), [sessions]);
  const lastAdjustment = useMemo(() => sessions.find((s) => s.adjustment)?.adjustment ?? null, [sessions]);

  function fresh(): SessionDraft {
    const last = sessions[0];
    return {
      id: newId(),
      trained_on: toYMD(new Date()),
      location: last?.location ?? user?.gym ?? null,
      duration_min: last?.duration_min ?? 60,
      attire: last?.attire ?? 'gi',
      session_type: last?.session_type ?? 'class',
      went_right: null,
      went_wrong: null,
      to_improve: null,
      entries: [],
      created_at: new Date().toISOString(),
      // Most sessions are on your focus; untick if not.
      focus_id: focus?.id ?? null,
      energy: null,
      adjustment: null,
      partners: [],
    };
  }

  // Start with an unfinished quick log, or a fresh one.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    AsyncStorage.getItem(quickKey(userId))
      .then((raw) => setDraft(raw ? (JSON.parse(raw) as SessionDraft) : fresh()))
      .catch(() => setDraft(fresh()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep it on the phone while you type, so leaving doesn't lose it.
  useEffect(() => {
    if (!draft || saved) return;
    const t = setTimeout(() => {
      const touched =
        draft.went_right || draft.went_wrong || draft.adjustment || draft.energy || draft.entries.length || draft.partners?.length;
      if (touched) AsyncStorage.setItem(quickKey(userId), JSON.stringify(draft)).catch(() => {});
      else AsyncStorage.removeItem(quickKey(userId)).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [draft, saved, userId]);

  if (!draft) {
    return (
      <View>
        <BackLink onPress={onDone} />
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  const update = (changes: Partial<SessionDraft>) => setDraft((d) => (d ? { ...d, ...changes } : d));
  const { subsFor, subsAgainst } = tally(draft.entries);
  const hasOther = draft.entries.some((e) => e.category !== 'submission');

  /** Voice dump: put what was understood into the form (never clearing what you'd already entered). */
  function applyDump({ transcript, details: d }: VoiceDump) {
    if (!d) {
      update({ went_right: draft!.went_right ? `${draft!.went_right}\n${transcript}` : transcript });
      return;
    }
    const merged: Entry[] = [...draft!.entries];
    for (const e of d.entries) {
      const i = merged.findIndex((x) => x.name.toLowerCase() === e.name.toLowerCase() && x.result === e.result);
      const lib = techniques.find((t) => t.name.toLowerCase() === e.name.toLowerCase());
      if (i >= 0) merged[i] = { ...merged[i], count: Math.max(merged[i].count, e.count) };
      else
        merged.push({
          name: lib?.name ?? e.name,
          category: (lib?.category ?? e.category) as Category,
          position: (lib?.position ?? e.position) as Position,
          result: e.result,
          count: e.count,
          technique_id: lib?.id ?? null,
        });
    }
    const partners = [...(draft!.partners ?? [])];
    for (const p of d.partners) {
      const i = p.name ? partners.findIndex((x) => x.name?.toLowerCase() === p.name!.toLowerCase()) : -1;
      const clean = { name: p.name, traits: p.traits as PartnerTrait[], outcome: (p.outcome as PartnerOutcome | null) ?? null };
      if (i >= 0) partners[i] = { ...partners[i], ...clean, traits: [...new Set([...partners[i].traits, ...clean.traits])] };
      else partners.push(clean);
    }
    const join = (a: string | null | undefined, b: string | null) => (a && b ? `${a}\n${b}` : a || b || null);
    update({
      went_right: join(draft!.went_right, d.went_right),
      went_wrong: join(draft!.went_wrong, d.went_wrong),
      adjustment: d.adjustment ?? draft!.adjustment ?? null,
      energy: d.energy ?? draft!.energy ?? null,
      focus_id: d.worked_on_focus === false ? null : d.worked_on_focus && focus ? focus.id : draft!.focus_id,
      duration_min: d.duration_min ?? draft!.duration_min,
      attire: d.attire ?? draft!.attire,
      session_type: d.session_type ?? draft!.session_type,
      location: d.location ?? draft!.location,
      entries: merged,
      partners,
    });
    if (merged.some((e) => e.category !== 'submission')) setShowOther(true);
  }

  async function save() {
    if (!draft || saving) return;
    setSaving(true);
    try {
      const clean: SessionDraft = {
        ...draft,
        location: draft.location?.trim() || null,
        went_right: draft.went_right?.trim() || null,
        went_wrong: draft.went_wrong?.trim() || null,
        adjustment: draft.adjustment?.trim() || null,
        partners: (draft.partners ?? []).filter((p) => p.name || p.traits.length || p.outcome),
      };
      await saveSession(clean);
      await AsyncStorage.removeItem(quickKey(userId)).catch(() => {});
      const { subsFor: sf, subsAgainst: sa } = tally(clean.entries);
      const session: TrainingSession = { ...clean, subs_for: sf, subs_against: sa, updated_at: new Date().toISOString() };
      setSaved({ session, feedback: feedbackFor(session, sessions.filter((s) => s.id !== clean.id), focus) });
      scrollToTop();
    } finally {
      setSaving(false);
    }
  }

  async function toFullLog() {
    // Hand everything over to the 4-step log (it opens on step 1 with this filled in).
    await AsyncStorage.setItem(fullKey(userId), JSON.stringify({ draft, step: 0 })).catch(() => {});
    await AsyncStorage.removeItem(quickKey(userId)).catch(() => {});
    onFullLog();
  }

  // --- Saved: micro-feedback ----------------------------------------------------------
  if (saved) {
    const p = focus ? focusProgress(focus, [saved.session, ...sessions.filter((s) => s.id !== saved.session.id)]) : null;
    return (
      <View>
        <View style={[styles.card, styles.doneCard]}>
          <View style={styles.doneIcon}>
            <Text style={styles.doneTick}>✓</Text>
          </View>
          <Text style={styles.doneTitle}>Logged</Text>
          <Text style={styles.doneSub}>
            {dayLabel(saved.session.trained_on)} · {formatDuration(saved.session.duration_min)} · {ATTIRE_LABEL[saved.session.attire]}
          </Text>
          <FeedbackList items={saved.feedback} />
          {p && focus ? (
            <View style={styles.doneFocus}>
              <Text style={styles.doneFocusLabel}>{focus.title}</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.round(p.fraction * 100)}%` }]} />
              </View>
              <Text style={styles.doneFocusCount}>
                {p.reps} of {p.target} sessions
              </Text>
            </View>
          ) : null}
        </View>
        <PrimaryButton title="Back to home" onPress={onDone} />
      </View>
    );
  }

  return (
    <View>
      <View style={styles.topRow}>
        <BackLink onPress={onDone} />
        <Pressable onPress={toFullLog} hitSlop={8} accessibilityRole="button">
          <Text style={styles.fullLink}>Full log ›</Text>
        </Pressable>
      </View>
      <Text style={styles.title}>Quick log</Text>

      {/* Talk it through */}
      <View style={styles.voice}>
        <VoiceNote
          mode="session"
          context={{
            focus: focus?.title ?? null,
            partners: recentPartnerNames(partnerHistory, 30),
            today: toYMD(new Date()),
          }}
          onDetails={applyDump}
        />
      </View>
      <Text style={styles.or}>or tap</Text>

      {/* When / where: defaults from last time, one tap to change */}
      <View style={styles.card}>
        <Pressable
          onPress={() => setEditDetails((o) => !o)}
          accessibilityRole="button"
          accessibilityState={{ expanded: editDetails }}
          style={styles.detailsRow}
        >
          <View style={styles.flex}>
            <Text style={styles.detailsDay}>{dayLabel(draft.trained_on)}</Text>
            <Text style={styles.detailsLine} numberOfLines={1}>
              {[draft.location, formatDuration(draft.duration_min), ATTIRE_LABEL[draft.attire], SESSION_TYPE_LABEL[draft.session_type]]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <Text style={styles.change}>{editDetails ? 'Done' : 'Change'}</Text>
        </Pressable>
        {editDetails ? (
          <View style={styles.detailsEdit}>
            <DayPicker
              value={draft.trained_on}
              onChange={(trained_on) => update({ trained_on })}
              marked={new Set(sessions.map((s) => s.trained_on))}
            />
            <TextInput
              value={draft.location ?? ''}
              onChangeText={(location) => update({ location })}
              placeholder="Gym or place"
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.accent}
              maxLength={80}
              autoCapitalize="words"
              style={[styles.input, styles.spaced]}
            />
            <RecentPlaces current={draft.location} places={[...sessions.map((s) => s.location), user?.gym]} onPick={(location) => update({ location })} />
            <View style={styles.chips}>
              {DURATIONS.map((m) => (
                <Chip key={m} label={formatDuration(m)} on={draft.duration_min === m} onPress={() => update({ duration_min: m })} small />
              ))}
            </View>
            <View style={[styles.chips, styles.spaced]}>
              <Chip label="Gi" on={draft.attire === 'gi'} onPress={() => update({ attire: 'gi' })} />
              <Chip label="No-Gi" on={draft.attire === 'nogi'} onPress={() => update({ attire: 'nogi' })} />
            </View>
            <View style={[styles.chips, styles.spaced]}>
              {SESSION_TYPES.map((t) => (
                <Chip key={t.id} label={t.label} on={draft.session_type === t.id} onPress={() => update({ session_type: t.id })} small />
              ))}
            </View>
          </View>
        ) : null}
      </View>

      {/* Focus */}
      <View style={styles.card}>
        <FocusCheck
          focus={focus}
          on={!!focus && draft.focus_id === focus.id}
          onChange={(on) => update({ focus_id: on && focus ? focus.id : null })}
          onSetFocus={onFocus}
        />
      </View>

      {/* What worked / what didn't */}
      <View style={styles.card}>
        <Text style={styles.label}>What worked</Text>
        <TextInput
          value={draft.went_right ?? ''}
          onChangeText={(went_right) => update({ went_right })}
          placeholder="e.g. Stayed calm in side control"
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          multiline
          maxLength={2000}
          style={[styles.input, styles.notes]}
        />
        <Text style={[styles.label, styles.spaced]}>What didn't</Text>
        <TextInput
          value={draft.went_wrong ?? ''}
          onChangeText={(went_wrong) => update({ went_wrong })}
          placeholder="e.g. Got flattened in half guard"
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          multiline
          maxLength={2000}
          style={[styles.input, styles.notes]}
        />
      </View>

      {/* Taps */}
      <View style={styles.card}>
        <View style={styles.sectionRow}>
          <Text style={styles.section}>Subs you got</Text>
          <Text style={[styles.count, { color: colors.success }]}>{subsFor}</Text>
        </View>
        <TechniquePicker
          library={techniques}
          usage={usage}
          categories={['submission']}
          result="hit"
          entries={draft.entries}
          onChange={(entries) => update({ entries })}
          accent={colors.success}
          emptyText="Tap any you got."
        />
        <View style={[styles.sectionRow, styles.spacedLg]}>
          <Text style={styles.section}>Got tapped by</Text>
          <Text style={[styles.count, { color: colors.danger }]}>{subsAgainst}</Text>
        </View>
        <TechniquePicker
          library={techniques}
          usage={usage}
          categories={['submission']}
          result="conceded"
          entries={draft.entries}
          onChange={(entries) => update({ entries })}
          accent={colors.danger}
          emptyText="Tap what caught you."
        />
        {showOther || hasOther ? (
          <>
            <Text style={[styles.section, styles.spacedLg]}>Other things that worked</Text>
            <TechniquePicker
              library={techniques}
              usage={usage}
              categories={OTHER}
              result="hit"
              entries={draft.entries}
              onChange={(entries) => update({ entries })}
              accent="#2E7DD7"
              emptyText="Passes, sweeps, escapes, takedowns."
            />
          </>
        ) : (
          <Pressable onPress={() => setShowOther(true)} hitSlop={8} accessibilityRole="button" style={styles.spacedLg}>
            <Text style={styles.link}>+ Passes, sweeps, escapes</Text>
          </Pressable>
        )}
      </View>

      {/* Energy */}
      <View style={styles.card}>
        <Text style={styles.section}>Energy</Text>
        <Text style={styles.sub}>How did your tank feel?</Text>
        <EnergyPicker value={draft.energy} onChange={(energy) => update({ energy })} />
      </View>

      {/* Partners */}
      <View style={styles.card}>
        <Text style={styles.section}>Who did you roll with?</Text>
        <Text style={styles.sub}>Optional. Helps spot who gives you trouble.</Text>
        <PartnerPicker partners={draft.partners ?? []} onChange={(partners) => update({ partners })} history={partnerHistory} />
      </View>

      {/* The one adjustment */}
      <View style={styles.card}>
        <Text style={styles.section}>One thing to change next time</Text>
        {lastAdjustment ? <Text style={styles.sub}>Last time: {lastAdjustment}</Text> : <Text style={styles.sub}>Just one. Small and specific.</Text>}
        <TextInput
          value={draft.adjustment ?? ''}
          onChangeText={(adjustment) => update({ adjustment })}
          placeholder="e.g. Get my frame in before they settle"
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          maxLength={300}
          style={styles.input}
        />
      </View>

      <PrimaryButton title="Save" onPress={save} loading={saving} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  muted: { color: colors.textMuted, fontSize: 15 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fullLink: { color: colors.accent, fontSize: 15, fontWeight: '800' },
  title: { color: colors.text, fontSize: 28, fontWeight: '900', marginBottom: space(4) },
  voice: { marginBottom: space(2) },
  or: { color: colors.textMuted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', marginBottom: space(3) },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(4),
    marginBottom: space(4),
  },
  detailsRow: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  detailsDay: { color: colors.text, fontSize: 16, fontWeight: '800' },
  detailsLine: { color: colors.textMuted, fontSize: 14, marginTop: 2 },
  change: { color: colors.accent, fontSize: 14, fontWeight: '800' },
  detailsEdit: { marginTop: space(4) },
  label: { color: colors.text, fontSize: 14, fontWeight: '800', marginBottom: space(2) },
  section: { color: colors.text, fontSize: 16, fontWeight: '800' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { fontSize: 20, fontWeight: '900' },
  sub: { color: colors.textMuted, fontSize: 13, marginTop: 2, marginBottom: space(3) },
  link: { color: colors.accent, fontSize: 14, fontWeight: '800' },
  spaced: { marginTop: space(3) },
  spacedLg: { marginTop: space(5) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  input: {
    color: colors.text,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: space(3),
    paddingVertical: space(3),
    fontSize: 15,
  },
  notes: { minHeight: 64, textAlignVertical: 'top' },

  doneCard: { alignItems: 'center', paddingVertical: space(6) },
  doneIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space(3),
  },
  doneTick: { color: colors.white, fontSize: 28, fontWeight: '900' },
  doneTitle: { color: colors.text, fontSize: 22, fontWeight: '900' },
  doneSub: { color: colors.textMuted, fontSize: 14, marginTop: space(1) },
  doneFocus: { alignSelf: 'stretch', marginTop: space(5) },
  doneFocusLabel: { color: colors.text, fontSize: 14, fontWeight: '800', marginBottom: space(2) },
  doneFocusCount: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: space(1) },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: colors.success },
}));
