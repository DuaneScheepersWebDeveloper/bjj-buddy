import { Pressable, Text, View } from 'react-native';
import { dayIndex } from '../lib/week';
import { radius, space } from '../theme';
import { makeStyles, useTheme } from '../ThemeContext';

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
  /** Which day is today (0 = Mon). Defaults to today; pass 7 for a past week, -1 for a future one. */
  todayIndex?: number;
  /** Day-of-month numbers shown under the letters (e.g. [27, 28, ...]). */
  dayNumbers?: number[];
  /** Makes days tappable (every day up to today; future days aren't). */
  onDayPress?: (day: number) => void;
  /** The tapped day, shown with a ring. */
  selectedDay?: number | null;
  /** Replaces the streak / "more to reach" line (e.g. for a past week). */
  summary?: string;
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
  accent: accentProp,
  maxGoal = 30,
  todayIndex,
  dayNumbers,
  onDayPress,
  selectedDay = null,
  summary,
}: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const accent = accentProp ?? colors.accent;
  const today = todayIndex ?? dayIndex(new Date());
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
          const tappable = !!onDayPress && !future;
          const selected = selectedDay === i;
          return (
            <Pressable
              key={i}
              onPress={tappable ? () => onDayPress!(i) : undefined}
              disabled={!tappable}
              style={styles.day}
              accessibilityRole={tappable ? 'button' : undefined}
              accessibilityState={tappable ? { selected } : undefined}
              accessibilityLabel={`${DAY_NAMES[i]}${dayNumbers ? ` ${dayNumbers[i]}` : ''}${isToday ? ' (today)' : ''}: ${n} ${plural(n, unit)}${tappable ? (selected ? '. Tap to hide' : '. Tap to see') : ''}`}
            >
              <Text style={[styles.letter, isToday && styles.letterToday]}>{LETTERS[i]}</Text>
              <View style={[styles.ring, selected && { borderColor: accent }]}>
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
              {dayNumbers ? <Text style={[styles.dayNum, (isToday || selected) && styles.letterToday]}>{dayNumbers[i]}</Text> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Text style={styles.streak}>
          {summary ? (
            summary
          ) : streak > 0 ? (
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

const useStyles = makeStyles((colors) => ({
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
  dayNum: { color: colors.textMuted, fontSize: 11, fontWeight: '600', marginTop: -space(1) },
  // A ring around the dot of the day you tapped.
  ring: { padding: 2, borderRadius: 21, borderWidth: 2, borderColor: 'transparent' },
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
}));
