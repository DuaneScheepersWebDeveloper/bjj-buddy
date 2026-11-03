import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../auth/AuthContext';
import { useSessions } from '../sessions/SessionsContext';
import { newId } from '../offline/outbox';
import { PrimaryButton } from '../components/PrimaryButton';
import { TechniquePicker } from '../components/TechniquePicker';
import { VoiceNote, type VoiceField } from '../components/VoiceNote';
import { CalendarPicker } from '../components/CalendarPicker';
import { radius, space } from '../theme';
import { makeStyles, useTheme } from '../ThemeContext';
import {
  ATTIRE_LABEL,
  CATEGORY_ONE,
  MAX_NOTES,
  POSITION_LABEL,
  SESSION_TYPES,
  SESSION_TYPE_LABEL,
  dayLabel,
  fullDate,
  formatDuration,
  tally,
  toYMD,
  type Category,
  type Entry,
  type Result,
  type SessionDraft,
} from '../sessions/types';

const STEPS = ['Details', 'Went right', 'Went wrong', 'Review'] as const;
const TECH_BLUE = '#2E7DD7';
const OTHER_CATEGORIES: Category[] = ['pass', 'sweep', 'escape', 'takedown', 'position'];
const DURATION_CHOICES = [45, 60, 90, 120];
const draftKey = (userId: number) => `bjjbuddy.sessionDraft.v1.${userId}`;

type Props = {
  /** Edit this session; leave out to log a new one. */
  editId?: string | null;
  onDone: () => void;
  /** Scroll the page back to the top (when moving between steps). */
  scrollToTop: () => void;
  /** Lets this screen handle the Android back button (step back instead of leaving). */
  setBackHandler: (handler: (() => boolean) | null) => void;
};

/**
 * Log a training session in four short steps:
 *   1. Details: when, where, how long, Gi or No-Gi, class or open mat
 *   2. What went right: notes, subs you got, techniques that worked
 *   3. What went wrong: notes, what you got caught with, what to work on
 *   4. Review: check it, edit any part, save
 * Unfinished logs are kept on the phone, so closing the app doesn't lose them.
 */
export function LogSessionScreen({ editId, onDone, scrollToTop, setBackHandler }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { sessions, techniques, saveSession, deleteSession } = useSessions();
  // How often you've logged each technique, so the picker suggests your usual ones first.
  const usage = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of sessions) for (const e of s.entries) counts[e.name.toLowerCase()] = (counts[e.name.toLowerCase()] ?? 0) + e.count;
    return counts;
  }, [sessions]);
  const userId = user?.id ?? 0;
  const editing = editId ? sessions.find((s) => s.id === editId) ?? null : null;

  const [draft, setDraft] = useState<SessionDraft | null>(null);
  const [step, setStep] = useState(0);
  const [resumed, setResumed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Start: the session being edited, an unfinished log, or a fresh one with sensible defaults.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    if (editId) {
      if (!editing) return; // wait for sessions to load
      started.current = true;
      const { subs_for, subs_against, updated_at, unsynced, ...rest } = editing;
      setDraft({ ...rest, entries: rest.entries.map((e) => ({ ...e })) });
      setStep(3); // straight to the review, where every part has an Edit button
      return;
    }
    started.current = true;
    AsyncStorage.getItem(draftKey(userId))
      .then((raw) => {
        const saved = raw ? (JSON.parse(raw) as { draft: SessionDraft; step: number }) : null;
        if (saved?.draft) {
          setDraft(saved.draft);
          setStep(Math.min(saved.step ?? 0, 3));
          setResumed(true);
        } else setDraft(freshDraft());
      })
      .catch(() => setDraft(freshDraft()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, editing]);

  function freshDraft(): SessionDraft {
    const last = sessions[0];
    return {
      id: newId(),
      trained_on: toYMD(new Date()),
      location: last?.location ?? user?.gym ?? null,
      duration_min: last?.duration_min ?? 60,
      attire: last?.attire ?? 'gi',
      session_type: 'class',
      went_right: null,
      went_wrong: null,
      to_improve: null,
      entries: [],
      created_at: new Date().toISOString(),
    };
  }

  // Keep unfinished new logs on the phone (written shortly after each change, and when leaving).
  const unsaved = useRef<{ draft: SessionDraft; step: number } | null>(null);
  useEffect(() => {
    if (!draft || editId || saved) {
      unsaved.current = null;
      return;
    }
    // Opened and left without entering anything? Nothing worth keeping.
    const hasContent =
      step > 0 || draft.entries.length > 0 || !!(draft.went_right || draft.went_wrong || draft.to_improve);
    if (!hasContent) {
      unsaved.current = null;
      AsyncStorage.removeItem(draftKey(userId)).catch(() => {});
      return;
    }
    unsaved.current = { draft, step };
    const t = setTimeout(() => {
      AsyncStorage.setItem(draftKey(userId), JSON.stringify({ draft, step })).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [draft, step, editId, saved, userId]);
  useEffect(
    () => () => {
      if (unsaved.current) AsyncStorage.setItem(draftKey(userId), JSON.stringify(unsaved.current)).catch(() => {});
    },
    [userId],
  );

  const goTo = useCallback(
    (n: number) => {
      setStep(n);
      setConfirmDelete(false);
      scrollToTop();
    },
    [scrollToTop],
  );

  // Android back: go back a step rather than leaving the log.
  useEffect(() => {
    setBackHandler(() => {
      if (saved || step === 0 || (editId && step === 3)) return false;
      goTo(step - 1);
      return true;
    });
    return () => setBackHandler(null);
  }, [setBackHandler, step, saved, editId, goTo]);

  const update = (changes: Partial<SessionDraft>) => setDraft((d) => (d ? { ...d, ...changes } : d));

  async function save() {
    if (!draft || saving) return;
    setSaving(true);
    try {
      await saveSession({
        ...draft,
        location: draft.location?.trim() || null,
        went_right: draft.went_right?.trim() || null,
        went_wrong: draft.went_wrong?.trim() || null,
        to_improve: draft.to_improve?.trim() || null,
      });
      if (!editId) await AsyncStorage.removeItem(draftKey(userId)).catch(() => {});
      setSaved(true);
      scrollToTop();
    } finally {
      setSaving(false);
    }
  }

  async function startOver() {
    await AsyncStorage.removeItem(draftKey(userId)).catch(() => {});
    setDraft(freshDraft());
    setResumed(false);
    goTo(0);
  }

  async function remove() {
    if (!editId) return;
    await deleteSession(editId);
    onDone();
  }

  if (!draft) {
    return (
      <View>
        <BackLink onPress={onDone} />
        <Text style={styles.muted}>{editId ? 'Finding that session…' : 'Loading…'}</Text>
      </View>
    );
  }

  const { subsFor, subsAgainst } = tally(draft.entries);

  // --- Saved -------------------------------------------------------------------
  if (saved) {
    return (
      <View>
        <View style={[styles.card, styles.doneCard]}>
          <View style={styles.doneIcon}>
            <Text style={styles.doneTick}>✓</Text>
          </View>
          <Text style={styles.doneTitle}>{editId ? 'Changes saved' : 'Session logged'}</Text>
          <Text style={styles.doneSub}>
            {dayLabel(draft.trained_on)} · {formatDuration(draft.duration_min)} · {ATTIRE_LABEL[draft.attire]}
          </Text>
          <Score subsFor={subsFor} subsAgainst={subsAgainst} />
        </View>
        <PrimaryButton title="Back to home" onPress={onDone} />
        {!editId ? (
          <>
            <View style={styles.gap} />
            <PrimaryButton
              title="Log another session"
              variant="outline"
              onPress={() => {
                setSaved(false);
                setDraft(freshDraft());
                goTo(0);
              }}
            />
          </>
        ) : null}
      </View>
    );
  }

  return (
    <View>
      <BackLink onPress={onDone} label={editId ? '‹ Home' : '‹ Home (saved as draft)'} />
      <Text style={styles.title}>{editId ? 'Edit session' : 'Log a session'}</Text>

      <StepBar step={step} onStep={goTo} />

      {resumed && !editId && step < 3 ? (
        <View style={styles.resumeBar}>
          <Text style={styles.resumeText}>Picked up where you left off.</Text>
          <Pressable onPress={startOver} hitSlop={8} accessibilityRole="button">
            <Text style={styles.resumeLink}>Start over</Text>
          </Pressable>
        </View>
      ) : null}

      {/* --- 1. Details ---------------------------------------------------------- */}
      {step === 0 ? (
        <>
          <Text style={styles.stepTitle}>Where did you train?</Text>

          <View style={styles.card}>
            <Label>When</Label>
            <DayPicker
              value={draft.trained_on}
              onChange={(trained_on) => update({ trained_on })}
              marked={new Set(sessions.filter((x) => x.id !== draft.id).map((x) => x.trained_on))}
            />
            <Text style={styles.dateLine}>{fullDate(draft.trained_on)}</Text>

            <Label>Where</Label>
            <TextInput
              value={draft.location ?? ''}
              onChangeText={(location) => update({ location })}
              placeholder="Gym or place"
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.accent}
              maxLength={80}
              autoCapitalize="words"
              style={styles.input}
            />
            <RecentPlaces
              current={draft.location}
              places={[...sessions.map((s) => s.location), user?.gym]}
              onPick={(location) => update({ location })}
            />

            <Label>How long</Label>
            <View style={styles.durationRow}>
              <RoundButton label="−" a11y="15 minutes less" onPress={() => update({ duration_min: Math.max(15, draft.duration_min - 15) })} />
              <Text style={styles.durationValue}>{formatDuration(draft.duration_min)}</Text>
              <RoundButton label="+" a11y="15 minutes more" onPress={() => update({ duration_min: Math.min(600, draft.duration_min + 15) })} />
            </View>
            <View style={styles.chipRow}>
              {DURATION_CHOICES.map((m) => (
                <Choice key={m} label={formatDuration(m)} on={draft.duration_min === m} onPress={() => update({ duration_min: m })} small />
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Label>Gi or No-Gi</Label>
            <View style={styles.bigChoiceRow}>
              <BigChoice title="Gi" sub="Kimono" on={draft.attire === 'gi'} onPress={() => update({ attire: 'gi' })} />
              <BigChoice title="No-Gi" sub="Rash guard & shorts" on={draft.attire === 'nogi'} onPress={() => update({ attire: 'nogi' })} />
            </View>

            <Label>What kind of session</Label>
            <View style={styles.chipRow}>
              {SESSION_TYPES.map((t) => (
                <Choice key={t.id} label={t.label} on={draft.session_type === t.id} onPress={() => update({ session_type: t.id })} />
              ))}
            </View>
          </View>

          <PrimaryButton title="Next: What went right" onPress={() => goTo(1)} />
        </>
      ) : null}

      {/* --- 2. What went right ---------------------------------------------------- */}
      {step === 1 ? (
        <>
          <Text style={styles.stepTitle}>What went right?</Text>
          <Text style={styles.stepHint}>Start with the wins, big or small.</Text>

          <View style={styles.card}>
            <Notes
              field="went_right"
              value={draft.went_right}
              onChange={(went_right) => update({ went_right })}
              placeholder="e.g. Guard retention felt solid. Hit the knee slice twice and stayed calm under side control."
            />
          </View>

          <View style={styles.card}>
            <SectionHeader title="Subs you got" count={subsFor} color={colors.success} />
            <TechniquePicker
              library={techniques}
              usage={usage}
              categories={['submission']}
              result="hit"
              entries={draft.entries}
              onChange={(entries) => update({ entries })}
              accent={colors.success}
              emptyText="No subs today? That's fine. Tap any you got."
            />
          </View>

          <View style={styles.card}>
            <SectionHeader title="Other techniques that worked" subtitle="Passes, sweeps, escapes, takedowns, positions" />
            <TechniquePicker
              library={techniques}
              usage={usage}
              categories={OTHER_CATEGORIES}
              result="hit"
              entries={draft.entries}
              onChange={(entries) => update({ entries })}
              accent={TECH_BLUE}
              emptyText="Tap anything you pulled off."
            />
          </View>

          <PrimaryButton title="Next: What went wrong" onPress={() => goTo(2)} />
          <View style={styles.gap} />
          <PrimaryButton title="Back" variant="outline" onPress={() => goTo(0)} />
        </>
      ) : null}

      {/* --- 3. What went wrong ------------------------------------------------------ */}
      {step === 2 ? (
        <>
          <Text style={styles.stepTitle}>What went wrong?</Text>
          <Text style={styles.stepHint}>Every tap is a lesson.</Text>

          <View style={styles.card}>
            <Notes
              field="went_wrong"
              value={draft.went_wrong}
              onChange={(went_wrong) => update({ went_wrong })}
              placeholder="e.g. Kept getting flattened in half guard. Gassed out in the last round."
            />
          </View>

          <View style={styles.card}>
            <SectionHeader title="Did you get submitted?" count={subsAgainst} color={colors.danger} />
            <TechniquePicker
              library={techniques}
              usage={usage}
              categories={['submission']}
              result="conceded"
              entries={draft.entries}
              onChange={(entries) => update({ entries })}
              accent={colors.danger}
              emptyText="Didn't tap today? Nice. Otherwise, tap what caught you."
            />
          </View>

          <View style={styles.card}>
            <SectionHeader title="What will you work on?" subtitle="Things you noticed you can improve" />
            <Notes
              field="to_improve"
              value={draft.to_improve}
              onChange={(to_improve) => update({ to_improve })}
              placeholder="e.g. Frames before shrimping. Ask coach about the triangle defence."
              short
            />
          </View>

          <PrimaryButton title="Next: Review" onPress={() => goTo(3)} />
          <View style={styles.gap} />
          <PrimaryButton title="Back" variant="outline" onPress={() => goTo(1)} />
        </>
      ) : null}

      {/* --- 4. Review -------------------------------------------------------------- */}
      {step === 3 ? (
        <>
          <Text style={styles.stepTitle}>{editId ? 'Your session' : 'Check and save'}</Text>
          <Text style={styles.stepHint}>Tap Edit on anything you want to change.</Text>

          <View style={[styles.card, styles.scoreCard]}>
            <Score subsFor={subsFor} subsAgainst={subsAgainst} />
          </View>

          <ReviewCard title="Details" onEdit={() => goTo(0)}>
            <ReviewLine label="When" value={dayLabel(draft.trained_on)} />
            <ReviewLine label="Where" value={draft.location?.trim() || 'Not set'} muted={!draft.location?.trim()} />
            <ReviewLine label="How long" value={formatDuration(draft.duration_min)} />
            <ReviewLine label="Session" value={`${ATTIRE_LABEL[draft.attire]} · ${SESSION_TYPE_LABEL[draft.session_type]}`} />
          </ReviewCard>

          <ReviewCard title="What went right" onEdit={() => goTo(1)}>
            <ReviewText text={draft.went_right} empty="No notes" />
            <EntryChips entries={draft.entries} result="hit" color={colors.success} only="submission" label="Subs" />
            <EntryChips entries={draft.entries} result="hit" color={TECH_BLUE} except="submission" label="Techniques" />
          </ReviewCard>

          <ReviewCard title="What went wrong" onEdit={() => goTo(2)}>
            <ReviewText text={draft.went_wrong} empty="No notes" />
            <EntryChips entries={draft.entries} result="conceded" color={colors.danger} only="submission" label="Tapped to" />
            {draft.to_improve?.trim() ? (
              <>
                <Text style={styles.reviewSub}>Work on</Text>
                <ReviewText text={draft.to_improve} empty="" />
              </>
            ) : null}
          </ReviewCard>

          <PrimaryButton title={editId ? 'Save changes' : 'Save session'} onPress={save} loading={saving} />
          <View style={styles.gap} />
          {editId ? (
            confirmDelete ? (
              <View style={styles.confirm}>
                <Text style={styles.confirmText}>Delete this session for good?</Text>
                <View style={styles.confirmActions}>
                  <Pressable onPress={() => setConfirmDelete(false)} hitSlop={8} accessibilityRole="button">
                    <Text style={styles.resumeLink}>Keep it</Text>
                  </Pressable>
                  <Pressable onPress={remove} hitSlop={8} accessibilityRole="button" style={styles.deleteBtn}>
                    <Text style={styles.deleteBtnText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable onPress={() => setConfirmDelete(true)} accessibilityRole="button" style={styles.deleteLink}>
                <Text style={styles.deleteLinkText}>Delete session</Text>
              </Pressable>
            )
          ) : (
            <PrimaryButton title="Back" variant="outline" onPress={() => goTo(2)} />
          )}
        </>
      ) : null}
    </View>
  );
}

// --- Pieces -------------------------------------------------------------------------------

function BackLink({ onPress, label = '‹ Home' }: { onPress: () => void; label?: string }) {
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" style={styles.back}>
      <Text style={styles.backText}>{label}</Text>
    </Pressable>
  );
}

function StepBar({ step, onStep }: { step: number; onStep: (n: number) => void }) {
  const styles = useStyles();
  return (
    <View style={styles.steps} accessibilityRole="tablist">
      {STEPS.map((label, i) => (
        <Pressable
          key={label}
          onPress={() => onStep(i)}
          accessibilityRole="tab"
          accessibilityState={{ selected: i === step }}
          accessibilityLabel={`Step ${i + 1} of ${STEPS.length}: ${label}`}
          style={styles.stepItem}
        >
          <View style={[styles.stepBar, i <= step && styles.stepBarOn]} />
          <Text style={[styles.stepLabel, i === step && styles.stepLabelOn]} numberOfLines={1}>
            {i + 1}. {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function Label({ children }: { children: string }) {
  const styles = useStyles();
  return <Text style={styles.label}>{children}</Text>;
}

function SectionHeader({ title, subtitle, count, color }: { title: string; subtitle?: string; count?: number; color?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.flex}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
      </View>
      {count !== undefined ? (
        <View style={[styles.countPill, { borderColor: color }]}>
          <Text style={[styles.countPillText, { color }]}>{count}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** "Today", or a calendar to pick any other day (future days can't be picked). */
function DayPicker({ value, onChange, marked }: { value: string; onChange: (ymd: string) => void; marked: Set<string> }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const today = toYMD(new Date());
  const isToday = value === today;
  const [open, setOpen] = useState(false);
  return (
    <View>
      <View style={styles.chipRow}>
        <Choice
          label="Today"
          on={isToday}
          onPress={() => {
            onChange(today);
            setOpen(false);
          }}
        />
        <Pressable
          onPress={() => setOpen((o) => !o)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={isToday ? 'Pick another day' : `Picked ${dayLabel(value)}. Change day`}
          style={({ pressed }) => [styles.choice, styles.calBtn, !isToday && styles.choiceOn, pressed && styles.pressed]}
        >
          <View style={[styles.calIcon, { borderColor: isToday ? colors.text : colors.background }]}>
            <View style={[styles.calIconTop, { backgroundColor: isToday ? colors.text : colors.background }]} />
          </View>
          <Text style={[styles.choiceText, !isToday && styles.choiceTextOn]}>{isToday ? 'Pick a day' : dayLabel(value)}</Text>
        </Pressable>
      </View>
      {open ? (
        <CalendarPicker
          value={value}
          marked={marked}
          onChange={(ymd) => {
            onChange(ymd);
            setOpen(false);
          }}
        />
      ) : null}
    </View>
  );
}

function RecentPlaces({ current, places, onPick }: { current: string | null; places: (string | null | undefined)[]; onPick: (p: string) => void }) {
  const styles = useStyles();
  const unique: string[] = [];
  for (const p of places) {
    const t = p?.trim();
    if (t && !unique.some((u) => u.toLowerCase() === t.toLowerCase())) unique.push(t);
    if (unique.length >= 4) break;
  }
  const options = unique.filter((p) => p.toLowerCase() !== (current ?? '').trim().toLowerCase());
  if (options.length === 0) return <View style={styles.gapSmall} />;
  return (
    <View style={[styles.chipRow, styles.placeRow]}>
      {options.map((p) => (
        <Choice key={p} label={p} on={false} onPress={() => onPick(p)} small />
      ))}
    </View>
  );
}

function Choice({ label, on, onPress, small }: { label: string; on: boolean; onPress: () => void; small?: boolean }) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      style={({ pressed }) => [styles.choice, small && styles.choiceSmall, on && styles.choiceOn, pressed && styles.pressed]}
    >
      <Text style={[styles.choiceText, on && styles.choiceTextOn]}>{label}</Text>
    </Pressable>
  );
}

function BigChoice({ title, sub, on, onPress }: { title: string; sub: string; on: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      style={({ pressed }) => [styles.bigChoice, on && styles.bigChoiceOn, pressed && styles.pressed]}
    >
      <Text style={[styles.bigChoiceTitle, on && styles.bigChoiceTitleOn]}>{title}</Text>
      <Text style={styles.bigChoiceSub}>{sub}</Text>
    </Pressable>
  );
}

function RoundButton({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} hitSlop={6} style={({ pressed }) => [styles.round, pressed && styles.pressed]}>
      <Text style={styles.roundText}>{label}</Text>
    </Pressable>
  );
}

/** A roomy notes box: detailed but brief (up to 2000 characters). */
function Notes({
  field,
  value,
  onChange,
  placeholder,
  short,
}: {
  field: VoiceField;
  value: string | null;
  onChange: (t: string) => void;
  placeholder: string;
  short?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const length = value?.length ?? 0;
  return (
    <View>
      <TextInput
        value={value ?? ''}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.accent}
        multiline
        maxLength={MAX_NOTES}
        textAlignVertical="top"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.notes, short && styles.notesShort, focused && styles.notesFocused]}
      />
      {length > MAX_NOTES - 300 ? (
        <Text style={styles.notesCount}>
          {length} / {MAX_NOTES}
        </Text>
      ) : null}
      <VoiceNote field={field} current={value} onUse={(text) => onChange(text.slice(0, MAX_NOTES))} />
    </View>
  );
}

function Score({ subsFor, subsAgainst }: { subsFor: number; subsAgainst: number }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.score} accessibilityLabel={`${subsFor} submissions, tapped ${subsAgainst} times`}>
      <View style={styles.scoreSide}>
        <Text style={[styles.scoreNum, { color: colors.success }]}>{subsFor}</Text>
        <Text style={styles.scoreLabel}>Subs</Text>
      </View>
      <Text style={styles.scoreDash}>–</Text>
      <View style={styles.scoreSide}>
        <Text style={[styles.scoreNum, { color: colors.danger }]}>{subsAgainst}</Text>
        <Text style={styles.scoreLabel}>Tapped</Text>
      </View>
    </View>
  );
}

function ReviewCard({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.card}>
      <View style={styles.reviewHeader}>
        <Text style={styles.reviewTitle}>{title}</Text>
        <Pressable onPress={onEdit} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Edit ${title}`} style={styles.editBtn}>
          <Text style={styles.editText}>Edit</Text>
        </Pressable>
      </View>
      {children}
    </View>
  );
}

function ReviewLine({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.reviewLine}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={[styles.reviewValue, muted && styles.muted]}>{value}</Text>
    </View>
  );
}

function ReviewText({ text, empty }: { text: string | null; empty: string }) {
  const styles = useStyles();
  const t = text?.trim();
  if (!t && !empty) return null;
  return <Text style={[styles.reviewText, !t && styles.muted]}>{t || empty}</Text>;
}

function EntryChips({
  entries,
  result,
  color,
  only,
  except,
  label,
}: {
  entries: Entry[];
  result: Result;
  color: string;
  only?: Category;
  except?: Category;
  label: string;
}) {
  const styles = useStyles();
  const list = entries.filter(
    (e) => e.result === result && (!only || e.category === only) && (!except || e.category !== except),
  );
  if (list.length === 0) return null;
  return (
    <>
      <Text style={styles.reviewSub}>{label}</Text>
      <View style={styles.chipRow}>
        {list.map((e) => (
          <View key={e.name} style={[styles.entryChip, { borderColor: color }]}>
            <Text style={styles.entryChipText}>
              {e.name}
              {e.count > 1 ? ` ×${e.count}` : ''}
            </Text>
            <Text style={styles.entryChipMeta}>
              {e.category === 'submission' ? POSITION_LABEL[e.position] : `${CATEGORY_ONE[e.category]} · ${POSITION_LABEL[e.position]}`}
            </Text>
          </View>
        ))}
      </View>
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  gap: { height: space(3) },
  gapSmall: { height: space(4) },
  muted: { color: colors.textMuted },
  pressed: { opacity: 0.7 },
  back: { alignSelf: 'flex-start', paddingVertical: space(1), marginBottom: space(3) },
  backText: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
  title: { color: colors.text, fontSize: 30, fontWeight: '800', marginBottom: space(4) },

  steps: { flexDirection: 'row', gap: space(2), marginBottom: space(6) },
  stepItem: { flex: 1 },
  stepBar: { height: 5, borderRadius: 3, backgroundColor: colors.surfaceRaised, marginBottom: space(2) },
  stepBarOn: { backgroundColor: colors.accent },
  stepLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  stepLabelOn: { color: colors.text },

  resumeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    marginBottom: space(4),
  },
  resumeText: { color: colors.textMuted, fontSize: 14, flex: 1 },
  resumeLink: { color: colors.text, fontSize: 14, fontWeight: '800' },

  stepTitle: { color: colors.text, fontSize: 24, fontWeight: '800' },
  stepHint: { color: colors.textMuted, fontSize: 15, marginTop: space(1) },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(4),
    marginTop: space(4),
    marginBottom: space(1),
  },
  dateLine: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: space(3), marginBottom: space(4) },
  calBtn: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  calIcon: { width: 16, height: 15, borderRadius: 3, borderWidth: 1.5, overflow: 'hidden' },
  calIconTop: { height: 4 },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: '700', letterSpacing: 0.4, marginBottom: space(2) },
  input: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    marginBottom: space(2),
  },
  placeRow: { marginBottom: space(4) },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  choice: {
    paddingHorizontal: space(4),
    paddingVertical: space(2) + 2,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  choiceSmall: { paddingHorizontal: space(3), paddingVertical: 6 },
  choiceOn: { backgroundColor: colors.text, borderColor: colors.text },
  choiceText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  choiceTextOn: { color: colors.background },

  durationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space(3) },
  durationValue: { color: colors.text, fontSize: 26, fontWeight: '900' },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundText: { color: colors.text, fontSize: 22, fontWeight: '700', lineHeight: 24 },

  bigChoiceRow: { flexDirection: 'row', gap: space(3), marginBottom: space(5) },
  bigChoice: {
    flex: 1,
    paddingVertical: space(4),
    paddingHorizontal: space(3),
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
  },
  bigChoiceOn: { borderColor: colors.accent, backgroundColor: colors.accent + '18' },
  bigChoiceTitle: { color: colors.textMuted, fontSize: 20, fontWeight: '900' },
  bigChoiceTitleOn: { color: colors.text },
  bigChoiceSub: { color: colors.textMuted, fontSize: 12, marginTop: 2, textAlign: 'center' },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: space(3), marginBottom: space(3) },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  sectionSub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  countPill: { minWidth: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space(2) },
  countPillText: { fontSize: 18, fontWeight: '900' },

  notes: {
    minHeight: 150,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    padding: space(4),
  },
  notesShort: { minHeight: 100 },
  notesFocused: { borderColor: colors.borderFocus },
  notesCount: { color: colors.textMuted, fontSize: 12, textAlign: 'right', marginTop: space(1) },

  scoreCard: { paddingVertical: space(5) },
  score: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space(6) },
  scoreSide: { alignItems: 'center', minWidth: 70 },
  scoreNum: { fontSize: 44, fontWeight: '900', lineHeight: 50 },
  scoreLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  scoreDash: { color: colors.textMuted, fontSize: 30, fontWeight: '300' },

  reviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space(3) },
  reviewTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  editBtn: { paddingHorizontal: space(3), paddingVertical: space(1), borderRadius: 999, borderWidth: 1.5, borderColor: colors.border },
  editText: { color: colors.text, fontSize: 13, fontWeight: '800' },
  reviewLine: { flexDirection: 'row', justifyContent: 'space-between', gap: space(4), paddingVertical: space(1) + 2 },
  reviewLabel: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  reviewValue: { color: colors.text, fontSize: 14, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  reviewText: { color: colors.text, fontSize: 15, lineHeight: 22 },
  reviewSub: { color: colors.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, marginTop: space(4), marginBottom: space(2), textTransform: 'uppercase' },
  entryChip: { borderWidth: 1.5, borderRadius: radius.sm, paddingHorizontal: space(3), paddingVertical: space(1) + 2 },
  entryChipText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  entryChipMeta: { color: colors.textMuted, fontSize: 11, marginTop: 1 },

  deleteLink: { alignSelf: 'center', paddingVertical: space(3) },
  deleteLinkText: { color: colors.danger, fontSize: 15, fontWeight: '700' },
  confirm: { backgroundColor: colors.dangerSurface, borderRadius: radius.md, padding: space(4) },
  confirmText: { color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: space(3) },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: space(5) },
  deleteBtn: { backgroundColor: colors.danger, paddingHorizontal: space(5), paddingVertical: space(2), borderRadius: radius.sm },
  deleteBtnText: { color: colors.white, fontSize: 14, fontWeight: '800' },

  doneCard: { alignItems: 'center', paddingVertical: space(6), marginBottom: space(5) },
  doneIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: space(3) },
  doneTick: { color: colors.white, fontSize: 32, fontWeight: '900' },
  doneTitle: { color: colors.text, fontSize: 24, fontWeight: '900' },
  doneSub: { color: colors.textMuted, fontSize: 15, marginTop: space(1), marginBottom: space(5) },
}));
