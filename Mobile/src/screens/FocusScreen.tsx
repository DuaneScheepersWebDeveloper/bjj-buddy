import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useSessions } from '../sessions/SessionsContext';
import { useFocus } from '../focus/FocusContext';
import { PrimaryButton } from '../components/PrimaryButton';
import { Chip } from '../components/Reflection';
import { BackLink } from './LogSessionScreen';
import { focusProgress, focusSuggestions } from '../insights/insights';
import { radius, space } from '../theme';
import { makeStyles, useTheme } from '../ThemeContext';
import { FOCUS_OUTCOME_LABEL, dateLabel, dayLabel, type Focus, type FocusOutcome } from '../sessions/types';

const TARGETS = [4, 6, 8, 12];

/**
 * Focus: the deliberate-practice loop.
 *   pick ONE thing → log whether you worked on it each session → review after N sessions
 *   (got it / keep going / park it) → pick the next thing.
 * Your adjustments ("one thing to change next time") from those sessions are shown here as
 * the running reflection on this focus.
 */
export function FocusScreen({ onBack, onLog }: { onBack: () => void; onLog: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { sessions } = useSessions();
  const { active, all, startFocus, updateFocus, endFocus } = useFocus();
  const [mode, setMode] = useState<'view' | 'review' | 'new'>('view');
  const [outcome, setOutcome] = useState<FocusOutcome | null>(null);
  const [reflection, setReflection] = useState('');
  const [title, setTitle] = useState('');
  const [why, setWhy] = useState('');
  const [target, setTarget] = useState(8);
  const [busy, setBusy] = useState(false);

  const progress = active ? focusProgress(active, sessions) : null;
  const ideas = useMemo(() => focusSuggestions(sessions), [sessions]);
  const reps = useMemo(
    () => (active ? sessions.filter((s) => s.focus_id === active.id) : []),
    [active, sessions],
  );
  const past = all.filter((f) => f.ended_on);

  async function start() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await startFocus(
        { title, why, target_sessions: target },
        active && outcome ? { outcome, reflection } : undefined,
      );
      setTitle('');
      setWhy('');
      setOutcome(null);
      setReflection('');
      setMode('view');
    } finally {
      setBusy(false);
    }
  }

  async function finishReview() {
    if (!active || !outcome || busy) return;
    setBusy(true);
    try {
      if (outcome === 'keep_going') {
        // Same focus, more reps: raise the target and carry on.
        await updateFocus(active.id, { target_sessions: Math.max(active.target_sessions, reps.length) + 4 });
        setOutcome(null);
        setMode('view');
      } else {
        // Ending it: pick the next focus straight away (or later).
        setMode('new');
      }
    } finally {
      setBusy(false);
    }
  }

  async function endWithoutNew() {
    if (!active || !outcome) return;
    await endFocus(active.id, outcome, reflection);
    setOutcome(null);
    setReflection('');
    setMode('view');
  }

  // --- New focus form ---------------------------------------------------------------
  const newForm = (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{active ? 'What next?' : 'Pick your focus'}</Text>
      <Text style={styles.sub}>One specific thing. "Knee-cut pass" beats "passing".</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Framing to escape side control"
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.accent}
        maxLength={80}
        autoFocus={false}
        style={styles.input}
      />
      <View style={[styles.chips, styles.spaced]}>
        {ideas.map((idea) => (
          <Chip key={idea} label={idea} on={title === idea} onPress={() => setTitle(idea)} small />
        ))}
      </View>
      <Text style={[styles.label, styles.spacedLg]}>Why? (optional)</Text>
      <TextInput
        value={why}
        onChangeText={setWhy}
        placeholder="e.g. I keep getting stuck under bigger guys"
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.accent}
        maxLength={300}
        style={styles.input}
      />
      <Text style={[styles.label, styles.spacedLg]}>Review it after</Text>
      <View style={styles.chips}>
        {TARGETS.map((n) => (
          <Chip key={n} label={`${n} sessions`} on={target === n} onPress={() => setTarget(n)} small />
        ))}
      </View>
      <View style={styles.spacedLg} />
      <PrimaryButton title="Start this focus" onPress={start} loading={busy} disabled={!title.trim()} />
      {mode === 'new' && active && outcome ? (
        <Pressable onPress={endWithoutNew} hitSlop={8} accessibilityRole="button" style={styles.textBtn}>
          <Text style={styles.textBtnText}>End it and pick later</Text>
        </Pressable>
      ) : null}
      {mode !== 'view' ? (
        <Pressable
          onPress={() => {
            setMode('view');
            setOutcome(null);
          }}
          hitSlop={8}
          accessibilityRole="button"
          style={styles.textBtn}
        >
          <Text style={styles.textBtnText}>Cancel</Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <View>
      <BackLink onPress={onBack} />
      <Text style={styles.title}>Focus</Text>
      <Text style={styles.intro}>One thing at a time. Work on it, log it, review it, move on.</Text>

      {!active || mode === 'new' ? newForm : null}

      {active && progress && mode !== 'new' ? (
        <>
          <View style={[styles.card, styles.activeCard]}>
            <Text style={styles.kicker}>CURRENT FOCUS · SINCE {dayLabel(active.started_on).toUpperCase()}</Text>
            <Text style={styles.focusTitle}>{active.title}</Text>
            {active.why ? <Text style={styles.why}>{active.why}</Text> : null}
            <View style={styles.statsRow}>
              <Stat value={`${progress.reps}/${progress.target}`} label="sessions" />
              <Stat value={String(progress.daysActive)} label={progress.daysActive === 1 ? 'day' : 'days'} />
              <Stat value={progress.lastRepOn ? dayLabel(progress.lastRepOn).split(',')[0] : '—'} label="last rep" />
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.max(4, Math.round(progress.fraction * 100))}%` }]} />
            </View>
            <Text
              style={[
                styles.suggestion,
                progress.status === 'review' && { color: colors.success },
                progress.status === 'stale' && { color: colors.warning },
              ]}
            >
              {progress.suggestion}
            </Text>

            {mode === 'view' ? (
              <View style={styles.actions}>
                <PrimaryButton title="Log a session" onPress={onLog} />
                <View style={styles.gap} />
                <PrimaryButton title={progress.status === 'review' ? 'Review it now' : 'Review or change'} variant="outline" onPress={() => setMode('review')} />
              </View>
            ) : null}

            {mode === 'review' ? (
              <View style={styles.review}>
                <Text style={styles.cardTitle}>How's it going?</Text>
                <View style={styles.chips}>
                  <Chip label="Got it" on={outcome === 'got_it'} color={colors.success} onPress={() => setOutcome('got_it')} />
                  <Chip label="Keep going" on={outcome === 'keep_going'} onPress={() => setOutcome('keep_going')} />
                  <Chip label="Park it" on={outcome === 'parked'} color={colors.textMuted} onPress={() => setOutcome('parked')} />
                </View>
                <Text style={styles.sub}>
                  {outcome === 'keep_going'
                    ? 'Adds 4 more sessions to this focus.'
                    : outcome === 'got_it'
                      ? 'Nice. It goes in your history, then pick what is next.'
                      : outcome === 'parked'
                        ? 'Set it aside for now. You can come back to it.'
                        : 'Reinforce it, or change it?'}
                </Text>
                {outcome && outcome !== 'keep_going' ? (
                  <TextInput
                    value={reflection}
                    onChangeText={setReflection}
                    placeholder="What did you learn? (optional)"
                    placeholderTextColor={colors.textMuted}
                    selectionColor={colors.accent}
                    maxLength={1000}
                    multiline
                    style={[styles.input, styles.notes]}
                  />
                ) : null}
                <View style={styles.spaced} />
                <PrimaryButton title={outcome === 'keep_going' ? 'Keep going' : 'Next'} onPress={finishReview} disabled={!outcome} loading={busy} />
                <Pressable
                  onPress={() => {
                    setMode('view');
                    setOutcome(null);
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  style={styles.textBtn}
                >
                  <Text style={styles.textBtnText}>Cancel</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          {/* The running reflection: what you said you'd change, session by session */}
          <Text style={styles.section}>Your adjustments</Text>
          {reps.filter((s) => s.adjustment).length === 0 ? (
            <Text style={styles.empty}>
              After each session on this focus, note one thing to change next time. They'll build up here.
            </Text>
          ) : (
            reps
              .filter((s) => s.adjustment)
              .slice(0, 8)
              .map((s) => (
                <View key={s.id} style={styles.adjustment}>
                  <Text style={styles.adjustmentDate}>{dateLabel(s.trained_on)}</Text>
                  <Text style={styles.adjustmentText}>{s.adjustment}</Text>
                </View>
              ))
          )}
        </>
      ) : null}

      {past.length ? (
        <>
          <Text style={[styles.section, styles.spacedLg]}>Past focuses</Text>
          {past.map((f) => (
            <PastFocus key={f.id} focus={f} reps={sessions.filter((s) => s.focus_id === f.id).length} />
          ))}
        </>
      ) : null}
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function PastFocus({ focus: f, reps }: { focus: Focus; reps: number }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const color = f.outcome === 'got_it' ? colors.success : colors.textMuted;
  return (
    <View style={styles.past}>
      <View style={styles.pastHead}>
        <Text style={styles.pastTitle} numberOfLines={2}>
          {f.title}
        </Text>
        {f.outcome ? <Text style={[styles.pastOutcome, { color, borderColor: color }]}>{FOCUS_OUTCOME_LABEL[f.outcome]}</Text> : null}
      </View>
      <Text style={styles.pastMeta}>
        {dateLabel(f.started_on)} – {f.ended_on ? dateLabel(f.ended_on) : 'now'} · {reps} session{reps === 1 ? '' : 's'}
      </Text>
      {f.reflection ? <Text style={styles.pastReflection}>{f.reflection}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  title: { color: colors.text, fontSize: 28, fontWeight: '900' },
  intro: { color: colors.textMuted, fontSize: 14, marginTop: space(1), marginBottom: space(5) },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(5),
    marginBottom: space(5),
  },
  activeCard: { borderWidth: 1.5, borderColor: colors.accent },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '900', marginBottom: space(1) },
  sub: { color: colors.textMuted, fontSize: 13, marginTop: space(2), marginBottom: space(3), lineHeight: 19 },
  label: { color: colors.text, fontSize: 14, fontWeight: '800', marginBottom: space(2) },
  kicker: { color: colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  focusTitle: { color: colors.text, fontSize: 24, fontWeight: '900', marginTop: space(1) },
  why: { color: colors.textMuted, fontSize: 14, marginTop: space(1), lineHeight: 20 },
  statsRow: { flexDirection: 'row', marginTop: space(4) },
  stat: { flex: 1 },
  statValue: { color: colors.text, fontSize: 20, fontWeight: '900' },
  statLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised, overflow: 'hidden', marginTop: space(4) },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  suggestion: { color: colors.text, fontSize: 14, fontWeight: '600', marginTop: space(3), lineHeight: 20 },
  actions: { marginTop: space(5) },
  gap: { height: space(3) },
  review: { marginTop: space(5), borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space(4) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  spaced: { marginTop: space(3) },
  spacedLg: { marginTop: space(5) },
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
  notes: { minHeight: 70, textAlignVertical: 'top' },
  textBtn: { alignSelf: 'center', paddingVertical: space(3) },
  textBtnText: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
  section: { color: colors.text, fontSize: 17, fontWeight: '900', marginBottom: space(3) },
  empty: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  adjustment: { borderLeftWidth: 3, borderLeftColor: colors.accent, paddingLeft: space(3), marginBottom: space(3) },
  adjustmentDate: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  adjustmentText: { color: colors.text, fontSize: 15, marginTop: 2, lineHeight: 21 },
  past: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(4),
    marginBottom: space(3),
  },
  pastHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space(2) },
  pastTitle: { color: colors.text, fontSize: 16, fontWeight: '800', flex: 1 },
  pastOutcome: { fontSize: 12, fontWeight: '800', borderWidth: 1.5, borderRadius: 999, paddingHorizontal: space(2), paddingVertical: 1 },
  pastMeta: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: space(1) },
  pastReflection: { color: colors.text, fontSize: 14, marginTop: space(2), lineHeight: 20 },
}));
