import { Pressable, StyleSheet, Text, View } from 'react-native';
import { dayIndex } from '../lib/week';
import { colors, radius, space } from '../theme';

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const GREEN = '#2E9E66';

type Props = {
  /** Counts for Monday..Sunday of this week (from weekCounts()). */
  counts: number[];
  /** Weekly target, e.g. 3 sessions or 5 tasks. */
  goal: number;
  /** Singular noun: "session", "task"... */
  unit: string;
  /** Weeks in a row the goal was hit (from weekStreak()). */
  streak?: number;
  /** Lets the user change the goal with − / + buttons. Leave out to hide them. */
  onChangeGoal?: (goal: number) => void;
  title?: string;
  /** Colour for days with activity. Defaults to the app's red. */
  accent?: string;
  maxGoal?: number;
};

const plural = (n: number, unit: string) => `${unit}${n === 1 ? '' : 's'}`;

/**
 * "This week" card: Monday-to-Sunday dots, progress towards a weekly goal, and a streak.
 * Reusable: the admin Tasks page uses it for tasks; the home page will use it for sessions.
 */
export function WeekWidget({
  counts,
  goal,
  unit,
  streak = 0,
  onChangeGoal,
  title = 'This week',
  accent = colors.accent,
  maxGoal = 30,
}: Props) {
  const today = dayIndex(new Date());
  const total = counts.reduce((a, b) => a + b, 0);
  const reached = goal > 0 && total >= goal;
  const progress = goal > 0 ? Math.min(1, total / goal) : 0;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={[styles.count, reached && { color: GREEN }]}>
          {total}
          <Text style={styles.countOf}>
            {' '}/ {goal} {plural(goal, unit)}
          </Text>
        </Text>
      </View>

      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: goal, now: Math.min(total, goal) }}
        accessibilityLabel={`${total} of ${goal} ${plural(goal, unit)} this week`}
      >
        <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: reached ? GREEN : accent }]} />
      </View>

      <View style={styles.days}>
        {counts.map((n, i) => {
          const isToday = i === today;
          const future = i > today;
          return (
            <View
              key={i}
              style={styles.day}
              accessibilityLabel={`${DAY_NAMES[i]}${isToday ? ' (today)' : ''}: ${n} ${plural(n, unit)}`}
            >
              <Text style={[styles.letter, isToday && styles.letterToday]}>{LETTERS[i]}</Text>
              <View
                style={[
                  styles.dot,
                  n > 0 && { backgroundColor: accent, borderColor: accent },
                  isToday && n === 0 && styles.dotToday,
                  future && styles.dotFuture,
                ]}
              >
                {n > 0 ? <Text style={styles.dotText}>{n}</Text> : null}
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Text style={styles.streak}>
          {streak > 0 ? (
            <>
              <Text style={styles.streakNum}>{streak}</Text>-week streak
            </>
          ) : reached ? (
            'Goal reached this week!'
          ) : (
            `${Math.max(0, goal - total)} more to reach this week's goal`
          )}
        </Text>

        {onChangeGoal ? (
          <View style={styles.stepper}>
            <Text style={styles.stepperLabel}>Goal</Text>
            <Pressable
              onPress={() => onChangeGoal(Math.max(1, goal - 1))}
              disabled={goal <= 1}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Lower weekly goal"
              style={({ pressed }) => [styles.stepBtn, (pressed || goal <= 1) && styles.stepBtnDim]}
            >
              <Text style={styles.stepText}>−</Text>
            </Pressable>
            <Text style={styles.goalNum}>{goal}</Text>
            <Pressable
              onPress={() => onChangeGoal(Math.min(maxGoal, goal + 1))}
              disabled={goal >= maxGoal}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Raise weekly goal"
              style={({ pressed }) => [styles.stepBtn, (pressed || goal >= maxGoal) && styles.stepBtnDim]}
            >
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(5),
    marginBottom: space(4),
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  count: { color: colors.text, fontSize: 20, fontWeight: '800' },
  countOf: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceRaised,
    marginTop: space(3),
    marginBottom: space(4),
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 3 },
  days: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { alignItems: 'center', gap: space(2), flex: 1 },
  letter: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  letterToday: { color: colors.text },
  dot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 2,
    borderColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotToday: { borderColor: colors.text, backgroundColor: 'transparent' },
  dotFuture: { opacity: 0.45 },
  dotText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space(4),
    paddingTop: space(3),
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: space(3),
  },
  streak: { color: colors.textMuted, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  streakNum: { color: colors.text, fontWeight: '800' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  stepperLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginRight: space(1) },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnDim: { opacity: 0.4 },
  stepText: { color: colors.text, fontSize: 16, fontWeight: '700', lineHeight: 18 },
  goalNum: { color: colors.text, fontSize: 15, fontWeight: '800', minWidth: 18, textAlign: 'center' },
});
