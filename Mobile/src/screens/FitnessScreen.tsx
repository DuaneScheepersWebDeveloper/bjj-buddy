import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { useFitness, type WeightPoint } from '../fitness/useFitness';
import { radius, space } from '../theme';
import { makeStyles, useTheme } from '../ThemeContext';
import { dateLabel, daysAgo, fromYMD, toYMD } from '../sessions/types';

const WATER_BLUE = '#2E8BD7';
const GLASS_ML = 250;
const BOTTLE_ML = 500;

/** 1250 -> "1.25 L", 2000 -> "2 L". */
const litres = (ml: number) => `${(ml / 1000).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} L`;
const kg = (n: number) => `${n.toFixed(1)} kg`;

/** Stats → Fitness: today's water and your weight over time. */
export function FitnessScreen({ onBack }: { onBack: () => void }) {
  const styles = useStyles();
  const fitness = useFitness();
  return (
    <View>
      <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" style={styles.back}>
        <Text style={styles.backText}>‹ Home</Text>
      </Pressable>
      <Text style={styles.title}>Fitness</Text>
      <WaterCard {...fitness} />
      <WeightCard {...fitness} />
    </View>
  );
}

type Fitness = ReturnType<typeof useFitness>;

// --- Water ---------------------------------------------------------------------------------

function WaterCard({ water, goals, setGoals, setWater }: Fitness) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [editGoal, setEditGoal] = useState(false);
  const today = toYMD(new Date());
  const ml = water.find((d) => d.day === today)?.ml ?? 0;
  const goal = goals.waterMl;
  const pct = Math.min(1, ml / goal);
  const reached = ml >= goal;

  const glasses = Math.min(16, Math.round(goal / GLASS_ML));
  const full = Math.floor(ml / GLASS_ML);
  const partial = (ml % GLASS_ML) / GLASS_ML;

  const yesterday = water.find((d) => d.day === toYMD(daysAgo(1)))?.ml ?? 0;
  const week = Array.from({ length: 7 }, (_, i) => water.find((d) => d.day === toYMD(daysAgo(i + 1)))?.ml ?? 0);
  // Average of the days you logged water in the last week (days with nothing logged don't count).
  const logged = week.filter((v) => v > 0);
  const avg = logged.length ? Math.round(logged.reduce((a, b) => a + b, 0) / logged.length) : 0;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Water today</Text>
        <Pressable onPress={() => setEditGoal((v) => !v)} hitSlop={8} accessibilityRole="button" style={styles.goalBtn}>
          <Text style={styles.goalBtnText}>Goal {litres(goal)} ✎</Text>
        </Pressable>
      </View>

      {editGoal ? (
        <View style={styles.goalEdit}>
          <Text style={styles.muted}>Daily goal</Text>
          <Stepper
            value={litres(goal)}
            onMinus={() => setGoals({ waterMl: Math.max(500, goal - 250) })}
            onPlus={() => setGoals({ waterMl: Math.min(6000, goal + 250) })}
            label="water goal"
          />
        </View>
      ) : null}

      <View style={styles.waterRow}>
        <Text style={[styles.big, { color: reached ? colors.success : colors.text }]}>{litres(ml)}</Text>
        <Text style={styles.muted}>  of {litres(goal)}</Text>
      </View>

      <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: goal, now: Math.min(ml, goal) }}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: reached ? colors.success : WATER_BLUE }]} />
      </View>

      <View style={styles.glasses} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {Array.from({ length: glasses }, (_, i) => {
          const level = i < full ? 1 : i === full ? partial : 0;
          return (
            <View key={i} style={styles.glass}>
              <View style={[styles.glassWater, { height: `${level * 100}%`, backgroundColor: WATER_BLUE }]} />
            </View>
          );
        })}
      </View>

      <Text style={styles.status}>
        {reached ? 'Goal reached. Nice work!' : `${litres(goal - ml)} to go`}
      </Text>

      <View style={styles.actions}>
        <Pressable
          onPress={() => setWater(today, ml + GLASS_ML)}
          accessibilityRole="button"
          accessibilityLabel="Add a glass, 250 millilitres"
          style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
        >
          <Text style={styles.addBtnText}>+ Glass</Text>
          <Text style={styles.addBtnSub}>250 ml</Text>
        </Pressable>
        <Pressable
          onPress={() => setWater(today, ml + BOTTLE_ML)}
          accessibilityRole="button"
          accessibilityLabel="Add a bottle, 500 millilitres"
          style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
        >
          <Text style={styles.addBtnText}>+ Bottle</Text>
          <Text style={styles.addBtnSub}>500 ml</Text>
        </Pressable>
        <Pressable
          onPress={() => setWater(today, Math.max(0, ml - GLASS_ML))}
          disabled={ml === 0}
          accessibilityRole="button"
          accessibilityLabel="Remove a glass"
          style={({ pressed }) => [styles.undoBtn, (pressed || ml === 0) && styles.dim]}
        >
          <Text style={styles.undoText}>−</Text>
        </Pressable>
      </View>

      <Text style={styles.footer}>
        Yesterday {litres(yesterday)}
        {logged.length ? ` · Last 7 days average ${litres(avg)}` : ''}
      </Text>
    </View>
  );
}

// --- Weight --------------------------------------------------------------------------------

const RANGES = [
  { id: 30, label: '30 days' },
  { id: 90, label: '3 months' },
  { id: 365, label: 'Year' },
] as const;

function WeightCard({ weights, goals, setGoals, setWeight, deleteWeight }: Fitness) {
  const styles = useStyles();
  const { colors } = useTheme();
  const today = toYMD(new Date());
  const latest = weights[weights.length - 1] ?? null;
  const todays = weights.find((w) => w.day === today);
  const [value, setValue] = useState<string>((todays ?? latest)?.weight_kg.toFixed(1) ?? '');
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>(90);
  const [editTarget, setEditTarget] = useState(false);
  const [target, setTarget] = useState(goals.targetKg?.toFixed(1) ?? '');
  const [showAll, setShowAll] = useState(false);

  const parsed = Number(value.replace(',', '.'));
  const valid = value.trim() !== '' && parsed >= 20 && parsed <= 300;
  const nudge = (d: number) => {
    const base = valid ? parsed : latest?.weight_kg ?? 75;
    setValue((Math.round((base + d) * 10) / 10).toFixed(1));
  };

  const inRange = useMemo(() => {
    const from = toYMD(daysAgo(range));
    return weights.filter((w) => w.day >= from);
  }, [weights, range]);

  // Change over the last 30 days (compared with the closest weigh-in on or before then).
  const change = useMemo(() => {
    if (!latest) return null;
    const cutoff = toYMD(daysAgo(30));
    const before = [...weights].reverse().find((w) => w.day <= cutoff) ?? weights[0];
    if (!before || before.day === latest.day) return null;
    return Math.round((latest.weight_kg - before.weight_kg) * 10) / 10;
  }, [weights, latest]);

  const recent = [...weights].reverse().slice(0, showAll ? 30 : 5);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Weight</Text>
        <Pressable onPress={() => setEditTarget((v) => !v)} hitSlop={8} accessibilityRole="button" style={styles.goalBtn}>
          <Text style={styles.goalBtnText}>{goals.targetKg ? `Target ${kg(goals.targetKg)} ✎` : 'Set a target'}</Text>
        </Pressable>
      </View>

      {editTarget ? (
        <View style={styles.goalEdit}>
          <TextInput
            value={target}
            onChangeText={setTarget}
            placeholder="e.g. 76.0"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            style={[styles.input, styles.flex]}
            accessibilityLabel="Target weight in kilograms"
          />
          <Text style={styles.muted}>kg</Text>
          <Pressable
            onPress={() => {
              const n = Number(target.replace(',', '.'));
              setGoals({ targetKg: target.trim() && n >= 20 && n <= 300 ? Math.round(n * 10) / 10 : null });
              setEditTarget(false);
            }}
            accessibilityRole="button"
            style={styles.smallBtn}
          >
            <Text style={styles.smallBtnText}>{target.trim() ? 'Save' : 'Clear'}</Text>
          </Pressable>
        </View>
      ) : null}

      {latest ? (
        <>
          <View style={styles.waterRow}>
            <Text style={styles.big}>{kg(latest.weight_kg)}</Text>
            <Text style={styles.muted}>  {latest.day === today ? 'today' : dateLabel(latest.day)}</Text>
          </View>
          <Text style={styles.status}>
            {change == null ? 'Log a few weigh-ins to see your trend.' : `${change > 0 ? '+' : change < 0 ? '−' : '±'}${Math.abs(change).toFixed(1)} kg in 30 days`}
            {goals.targetKg
              ? ` · ${Math.abs(latest.weight_kg - goals.targetKg) < 0.05 ? 'on target' : `${kg(Math.abs(latest.weight_kg - goals.targetKg))} to target`}`
              : ''}
          </Text>

          <View style={styles.rangeRow}>
            {RANGES.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => setRange(r.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: range === r.id }}
                style={[styles.rangeChip, range === r.id && styles.rangeChipOn]}
              >
                <Text style={[styles.rangeText, range === r.id && styles.rangeTextOn]}>{r.label}</Text>
              </Pressable>
            ))}
          </View>
          <WeightChart points={inRange} target={goals.targetKg} days={range} />
        </>
      ) : (
        <Text style={[styles.muted, styles.empty]}>No weigh-ins yet. Log your first one below.</Text>
      )}

      {/* Log today */}
      <Text style={styles.label}>{todays ? "TODAY'S WEIGHT (TAP SAVE TO CHANGE IT)" : "LOG TODAY'S WEIGHT"}</Text>
      <View style={styles.logRow}>
        <Pressable onPress={() => nudge(-0.1)} accessibilityRole="button" accessibilityLabel="Minus 100 grams" style={styles.round}>
          <Text style={styles.roundText}>−</Text>
        </Pressable>
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder="e.g. 78.4"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          selectionColor={colors.accent}
          style={[styles.input, styles.weightInput]}
          accessibilityLabel="Weight in kilograms"
        />
        <Pressable onPress={() => nudge(0.1)} accessibilityRole="button" accessibilityLabel="Plus 100 grams" style={styles.round}>
          <Text style={styles.roundText}>+</Text>
        </Pressable>
        <Text style={styles.muted}>kg</Text>
      </View>
      <Pressable
        onPress={() => valid && setWeight(today, parsed)}
        disabled={!valid || todays?.weight_kg === Math.round(parsed * 10) / 10}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.saveBtn,
          (!valid || todays?.weight_kg === Math.round(parsed * 10) / 10 || pressed) && styles.dim,
        ]}
      >
        <Text style={styles.saveText}>
          {todays && todays.weight_kg === Math.round(parsed * 10) / 10 ? 'Saved for today' : todays ? 'Update today' : 'Save'}
        </Text>
      </Pressable>

      {recent.length ? (
        <>
          <Text style={styles.label}>RECENT</Text>
          {recent.map((w, i) => {
            const prev = recent[i + 1];
            const diff = prev ? Math.round((w.weight_kg - prev.weight_kg) * 10) / 10 : null;
            return (
              <View key={w.day} style={styles.entry}>
                <Text style={[styles.entryDay, styles.flex]}>{dateLabel(w.day)}</Text>
                <Text style={styles.entryKg}>{kg(w.weight_kg)}</Text>
                <Text style={styles.entryDiff}>{diff == null || diff === 0 ? '' : `${diff > 0 ? '+' : '−'}${Math.abs(diff).toFixed(1)}`}</Text>
                <Pressable
                  onPress={() => deleteWeight(w.day)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete weight for ${dateLabel(w.day)}`}
                >
                  <Text style={styles.delete}>×</Text>
                </Pressable>
              </View>
            );
          })}
          {weights.length > 5 ? (
            <Pressable onPress={() => setShowAll((v) => !v)} hitSlop={8} accessibilityRole="button" style={styles.more}>
              <Text style={styles.moreText}>{showAll ? 'Show fewer' : 'Show more'}</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/** A simple line chart of weight over the chosen range, with the target as a dashed line. */
function WeightChart({ points, target, days }: { points: WeightPoint[]; target: number | null; days: number }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const H = 140;
  const PAD = 10;

  if (points.length === 0) return <Text style={[styles.muted, styles.empty]}>No weigh-ins in this period.</Text>;

  const values = points.map((p) => p.weight_kg).concat(target ? [target] : []);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max - min < 2) {
    const mid = (max + min) / 2;
    min = mid - 1;
    max = mid + 1;
  }
  const start = daysAgo(days).getTime();
  const end = fromYMD(toYMD(new Date())).getTime();
  const x = (day: string) => PAD + ((fromYMD(day).getTime() - start) / Math.max(1, end - start)) * (width - PAD * 2);
  const y = (v: number) => PAD + (1 - (v - min) / (max - min)) * (H - PAD * 2);
  const line = points.map((p) => `${x(p.day)},${y(p.weight_kg)}`).join(' ');

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.chart}>
      {width > 0 ? (
        <Svg width={width} height={H}>
          {target ? (
            <Line x1={PAD} x2={width - PAD} y1={y(target)} y2={y(target)} stroke={colors.success} strokeWidth={1.5} strokeDasharray="5 5" />
          ) : null}
          {points.length > 1 ? (
            <Polyline points={line} fill="none" stroke={colors.accent} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          ) : null}
          {points.map((p) => (
            <Circle key={p.day} cx={x(p.day)} cy={y(p.weight_kg)} r={points.length > 40 ? 2 : 3.5} fill={colors.accent} />
          ))}
        </Svg>
      ) : null}
      <View style={styles.chartScale} pointerEvents="none">
        <Text style={styles.chartLabel}>{max.toFixed(1)}</Text>
        <Text style={styles.chartLabel}>{min.toFixed(1)}</Text>
      </View>
    </View>
  );
}

function Stepper({ value, onMinus, onPlus, label }: { value: string; onMinus: () => void; onPlus: () => void; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stepper}>
      <Pressable onPress={onMinus} accessibilityRole="button" accessibilityLabel={`Lower ${label}`} style={styles.round}>
        <Text style={styles.roundText}>−</Text>
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable onPress={onPlus} accessibilityRole="button" accessibilityLabel={`Raise ${label}`} style={styles.round}>
        <Text style={styles.roundText}>+</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  dim: { opacity: 0.45 },
  back: { alignSelf: 'flex-start', paddingVertical: space(1), marginBottom: space(3) },
  backText: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
  title: { color: colors.text, fontSize: 30, fontWeight: '800', marginBottom: space(5) },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(5),
    marginBottom: space(4),
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space(3) },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  goalBtn: { paddingHorizontal: space(3), paddingVertical: space(1), borderRadius: 999, borderWidth: 1.5, borderColor: colors.border },
  goalBtnText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  goalEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(3),
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    padding: space(3),
    marginBottom: space(3),
  },
  muted: { color: colors.textMuted, fontSize: 14 },
  empty: { marginVertical: space(3) },
  waterRow: { flexDirection: 'row', alignItems: 'baseline' },
  big: { color: colors.text, fontSize: 36, fontWeight: '900' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised, overflow: 'hidden', marginTop: space(3) },
  fill: { height: '100%', borderRadius: 4 },
  glasses: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginTop: space(4) },
  glass: {
    width: 16,
    height: 22,
    borderWidth: 1.5,
    borderColor: WATER_BLUE,
    borderTopWidth: 0,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  glassWater: { width: '100%', opacity: 0.85 },
  status: { color: colors.textMuted, fontSize: 14, fontWeight: '600', marginTop: space(3) },
  actions: { flexDirection: 'row', gap: space(3), marginTop: space(4) },
  addBtn: { flex: 1, alignItems: 'center', backgroundColor: WATER_BLUE, borderRadius: radius.md, paddingVertical: space(3) },
  addBtnText: { color: colors.white, fontSize: 16, fontWeight: '800' },
  addBtnSub: { color: colors.white, opacity: 0.85, fontSize: 12, marginTop: 1 },
  undoBtn: { width: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border },
  undoText: { color: colors.text, fontSize: 24, fontWeight: '700' },
  footer: { color: colors.textMuted, fontSize: 13, marginTop: space(4), paddingTop: space(3), borderTopWidth: 1, borderTopColor: colors.border },

  rangeRow: { flexDirection: 'row', gap: space(2), marginTop: space(4), marginBottom: space(2) },
  rangeChip: { paddingHorizontal: space(3), paddingVertical: 5, borderRadius: 999, borderWidth: 1.5, borderColor: colors.border },
  rangeChipOn: { backgroundColor: colors.text, borderColor: colors.text },
  rangeText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  rangeTextOn: { color: colors.background },
  chart: { height: 140, marginBottom: space(2) },
  chartScale: { position: 'absolute', top: 2, bottom: 2, right: 0, justifyContent: 'space-between' },
  chartLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '600' },

  label: { color: colors.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 1, marginTop: space(5), marginBottom: space(2) },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  input: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: space(3),
    paddingVertical: space(2),
  },
  weightInput: { flex: 1, textAlign: 'center', fontSize: 22 },
  round: { width: 42, height: 42, borderRadius: 21, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  roundText: { color: colors.text, fontSize: 20, fontWeight: '700', lineHeight: 22 },
  saveBtn: { marginTop: space(3), alignItems: 'center', backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: space(3) },
  saveText: { color: colors.white, fontSize: 16, fontWeight: '800' },
  smallBtn: { backgroundColor: colors.accent, borderRadius: radius.sm, paddingHorizontal: space(4), paddingVertical: space(2) },
  smallBtnText: { color: colors.white, fontSize: 14, fontWeight: '800' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  stepValue: { color: colors.text, fontSize: 18, fontWeight: '800', minWidth: 56, textAlign: 'center' },
  entry: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(2), borderTopWidth: 1, borderTopColor: colors.border },
  entryDay: { color: colors.text, fontSize: 14, fontWeight: '600' },
  entryKg: { color: colors.text, fontSize: 15, fontWeight: '800' },
  entryDiff: { color: colors.textMuted, fontSize: 13, fontWeight: '700', minWidth: 36, textAlign: 'right' },
  delete: { color: colors.textMuted, fontSize: 22, paddingHorizontal: space(1) },
  more: { alignSelf: 'flex-start', paddingVertical: space(2) },
  moreText: { color: colors.text, fontSize: 14, fontWeight: '700' },
}));
