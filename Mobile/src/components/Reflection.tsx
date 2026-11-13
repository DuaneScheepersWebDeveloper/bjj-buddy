import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { radius, space } from '../theme';
import { makeStyles, useTheme } from '../ThemeContext';
import {
  ENERGY_LABEL,
  OUTCOME_LABEL,
  PARTNER_TRAITS,
  type Focus,
  type Partner,
  type PartnerOutcome,
  type PartnerTrait,
} from '../sessions/types';
import type { Feedback } from '../insights/insights';

/**
 * The short reflection after class, shared by Quick Log and the full log:
 * did you work on your focus, how was your energy, who did you roll with.
 * Everything is a tap; typing is optional.
 */

// --- Focus ---------------------------------------------------------------------------

export function FocusCheck({
  focus,
  on,
  onChange,
  onSetFocus,
}: {
  focus: Focus | null;
  on: boolean;
  onChange: (on: boolean) => void;
  /** Shown when you don't have a focus yet. */
  onSetFocus?: () => void;
}) {
  const styles = useStyles();
  if (!focus) {
    return onSetFocus ? (
      <Pressable onPress={onSetFocus} accessibilityRole="button" style={({ pressed }) => [styles.focusEmpty, pressed && styles.pressed]}>
        <Text style={styles.focusEmptyTitle}>No focus set</Text>
        <Text style={styles.focusEmptySub}>Pick one thing to work on and the app tracks your reps ›</Text>
      </Pressable>
    ) : null;
  }
  return (
    <Pressable
      onPress={() => onChange(!on)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`Worked on my focus: ${focus.title}`}
      style={({ pressed }) => [styles.focusRow, on && styles.focusRowOn, pressed && styles.pressed]}
    >
      <View style={[styles.box, on && styles.boxOn]}>{on ? <Text style={styles.tick}>✓</Text> : null}</View>
      <View style={styles.flex}>
        <Text style={styles.focusLabel}>Worked on my focus</Text>
        <Text style={styles.focusTitle} numberOfLines={2}>
          {focus.title}
        </Text>
      </View>
    </Pressable>
  );
}

// --- Energy --------------------------------------------------------------------------

export function EnergyPicker({ value, onChange }: { value: number | null | undefined; onChange: (v: number | null) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const tint = (n: number) => (n <= 2 ? colors.warning : n === 3 ? colors.textMuted : colors.success);
  return (
    <View style={styles.energyRow} accessibilityRole="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = value === n;
        return (
          <Pressable
            key={n}
            onPress={() => onChange(on ? null : n)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`Energy ${n} of 5, ${ENERGY_LABEL[n]}`}
            style={({ pressed }) => [styles.energy, on && { borderColor: tint(n), backgroundColor: tint(n) }, pressed && styles.pressed]}
          >
            <View style={styles.bars}>
              {[1, 2, 3, 4, 5].map((b) => (
                <View
                  key={b}
                  style={[
                    styles.bar,
                    { height: 3 + b * 3 },
                    { backgroundColor: b <= n ? (on ? colors.white : tint(n)) : on ? 'rgba(255,255,255,0.35)' : colors.border },
                  ]}
                />
              ))}
            </View>
            <Text style={[styles.energyText, on && styles.energyTextOn]}>{ENERGY_LABEL[n]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// --- Partners ------------------------------------------------------------------------

/** Names you've rolled with before, most frequent first. */
export function recentPartnerNames(partnerLists: (Partner[] | undefined)[], limit = 8): string[] {
  const counts = new Map<string, { name: string; n: number }>();
  for (const list of partnerLists) {
    for (const p of list ?? []) {
      if (!p.name) continue;
      const key = p.name.toLowerCase();
      const cur = counts.get(key);
      counts.set(key, { name: cur?.name ?? p.name, n: (cur?.n ?? 0) + 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, limit).map((x) => x.name);
}

/** The traits you last gave someone, so picking a regular fills them in. */
export function lastTraitsFor(name: string, partnerLists: (Partner[] | undefined)[]): PartnerTrait[] {
  for (const list of partnerLists) {
    const hit = (list ?? []).find((p) => p.name?.toLowerCase() === name.toLowerCase());
    if (hit) return hit.traits;
  }
  return [];
}

export function PartnerPicker({
  partners,
  onChange,
  history,
}: {
  partners: Partner[];
  onChange: (p: Partner[]) => void;
  /** Partner lists from past sessions, newest first. */
  history: (Partner[] | undefined)[];
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [typing, setTyping] = useState('');
  const recent = useMemo(() => recentPartnerNames(history), [history]);
  const picked = new Set(partners.map((p) => p.name?.toLowerCase()).filter(Boolean));

  const add = (name: string | null) => {
    const clean = name?.trim().replace(/\s+/g, ' ') || null;
    if (clean && picked.has(clean.toLowerCase())) return;
    onChange([...partners, { name: clean, traits: clean ? lastTraitsFor(clean, history) : [], outcome: null }]);
    setTyping('');
  };
  const change = (i: number, p: Partner) => onChange(partners.map((x, j) => (j === i ? p : x)));
  const remove = (i: number) => onChange(partners.filter((_, j) => j !== i));

  return (
    <View>
      {partners.map((p, i) => (
        <View key={i} style={styles.partner}>
          <View style={styles.partnerHead}>
            <Text style={styles.partnerName} numberOfLines={1}>
              {p.name || `Partner ${i + 1}`}
            </Text>
            <Pressable onPress={() => remove(i)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${p.name || 'partner'}`}>
              <Text style={styles.remove}>×</Text>
            </Pressable>
          </View>
          <View style={styles.chips}>
            {PARTNER_TRAITS.map((t) => {
              const on = p.traits.includes(t.id);
              return (
                <Chip
                  key={t.id}
                  label={t.label}
                  on={on}
                  color="#2E7DD7"
                  small
                  onPress={() => change(i, { ...p, traits: on ? p.traits.filter((x) => x !== t.id) : [...p.traits, t.id] })}
                />
              );
            })}
          </View>
          <View style={[styles.chips, styles.outcomes]}>
            {(Object.keys(OUTCOME_LABEL) as PartnerOutcome[]).map((o) => (
              <Chip
                key={o}
                label={OUTCOME_LABEL[o]}
                on={p.outcome === o}
                color={o === 'tapped_them' ? colors.success : o === 'tapped_by' ? colors.danger : colors.textMuted}
                small
                onPress={() => change(i, { ...p, outcome: p.outcome === o ? null : o })}
              />
            ))}
          </View>
        </View>
      ))}

      {recent.filter((n) => !picked.has(n.toLowerCase())).length ? (
        <View style={styles.chips}>
          {recent
            .filter((n) => !picked.has(n.toLowerCase()))
            .map((n) => (
              <Chip key={n} label={`+ ${n}`} on={false} onPress={() => add(n)} />
            ))}
        </View>
      ) : null}
      <View style={styles.addRow}>
        <TextInput
          value={typing}
          onChangeText={setTyping}
          onSubmitEditing={() => typing.trim() && add(typing)}
          placeholder="Name (optional)"
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          maxLength={40}
          autoCapitalize="words"
          returnKeyType="done"
          style={styles.input}
        />
        <Pressable
          onPress={() => add(typing || null)}
          accessibilityRole="button"
          accessibilityLabel={typing.trim() ? `Add ${typing.trim()}` : 'Add a partner without a name'}
          style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
        >
          <Text style={styles.addBtnText}>{typing.trim() ? 'Add' : '+ Partner'}</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>No names needed: "Bigger · They tapped me" is enough to spot patterns.</Text>
    </View>
  );
}

// --- Feedback after saving -----------------------------------------------------------

export function FeedbackList({ items }: { items: Feedback[] }) {
  const styles = useStyles();
  const { colors } = useTheme();
  if (!items.length) return null;
  return (
    <View style={styles.feedback}>
      {items.map((f, i) => (
        <View key={i} style={styles.feedbackRow}>
          <View
            style={[
              styles.feedbackDot,
              { backgroundColor: f.tone === 'good' ? colors.success : f.tone === 'nudge' ? colors.warning : colors.textMuted },
            ]}
          />
          <Text style={styles.feedbackText}>{f.text}</Text>
        </View>
      ))}
    </View>
  );
}

// --- Bits ----------------------------------------------------------------------------

export function Chip({
  label,
  on,
  onPress,
  color,
  small,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  color?: string;
  small?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const c = color ?? colors.accent;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => [
        styles.chip,
        small && styles.chipSmall,
        on && { backgroundColor: c, borderColor: c },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.chipText, small && styles.chipTextSmall, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: space(2), lineHeight: 17 },

  focusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space(3),
  },
  focusRowOn: { borderColor: colors.success },
  box: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.success, borderColor: colors.success },
  tick: { color: colors.white, fontSize: 15, fontWeight: '900' },
  focusLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  focusTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 1 },
  focusEmpty: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.md, padding: space(3) },
  focusEmptyTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  focusEmptySub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },

  energyRow: { flexDirection: 'row', gap: space(2) },
  energy: {
    flex: 1,
    alignItems: 'center',
    gap: space(1),
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: space(2),
  },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 18 },
  bar: { width: 4, borderRadius: 1 },
  energyText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  energyTextOn: { color: colors.white },

  partner: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space(3),
    marginBottom: space(3),
    backgroundColor: colors.surfaceRaised,
  },
  partnerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space(2) },
  partnerName: { color: colors.text, fontSize: 15, fontWeight: '800', flex: 1 },
  remove: { color: colors.textMuted, fontSize: 22, paddingHorizontal: space(1) },
  outcomes: { marginTop: space(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  chip: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: space(2) - 1,
    paddingHorizontal: space(3),
    backgroundColor: colors.surface,
  },
  chipSmall: { paddingVertical: 4, paddingHorizontal: space(2) + 2 },
  chipText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  chipTextSmall: { fontSize: 13 },
  chipTextOn: { color: colors.white },
  addRow: { flexDirection: 'row', gap: space(2), marginTop: space(3) },
  input: {
    flex: 1,
    color: colors.text,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: space(3),
    paddingVertical: space(2) + 2,
    fontSize: 15,
  },
  addBtn: {
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.accent,
    paddingHorizontal: space(4),
  },
  addBtnText: { color: colors.accent, fontSize: 14, fontWeight: '800' },

  feedback: { gap: space(2), marginTop: space(4), alignSelf: 'stretch' },
  feedbackRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space(2) },
  feedbackDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  feedbackText: { color: colors.text, fontSize: 14, lineHeight: 20, flex: 1, fontWeight: '600' },
}));
