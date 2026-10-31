import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { radius, space } from '../theme';
import { makeStyles, useTheme } from '../ThemeContext';
import { fromYMD, toYMD } from '../sessions/types';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type Props = {
  /** Selected day, "YYYY-MM-DD". */
  value: string;
  onChange: (ymd: string) => void;
  /** Latest day you can pick (defaults to today). */
  maxDate?: string;
  /** Days to mark with a dot (e.g. days you've already logged). */
  marked?: Set<string>;
};

/** A month calendar (weeks start on Monday). Tap a day to pick it; ‹ › change month. */
export function CalendarPicker({ value, onChange, maxDate = toYMD(new Date()), marked }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const max = fromYMD(maxDate);
  const start = fromYMD(value);
  const [month, setMonth] = useState(() => new Date(start.getFullYear(), start.getMonth(), 1));

  const canGoNext = month.getFullYear() < max.getFullYear() || month.getMonth() < max.getMonth();
  const today = toYMD(new Date());

  // Blank cells before the 1st (Monday-first), then each day of the month.
  const cells = useMemo(() => {
    const lead = (month.getDay() + 6) % 7;
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const list: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= daysInMonth; d++) list.push(toYMD(new Date(month.getFullYear(), month.getMonth(), d)));
    while (list.length % 7) list.push(null);
    return list;
  }, [month]);

  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));

  return (
    <View style={styles.box}>
      <View style={styles.header}>
        <Pressable onPress={() => shift(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous month" style={({ pressed }) => [styles.nav, pressed && styles.pressed]}>
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <Text style={styles.month}>
          {MONTHS[month.getMonth()]} {month.getFullYear()}
        </Text>
        <Pressable
          onPress={() => shift(1)}
          disabled={!canGoNext}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          style={({ pressed }) => [styles.nav, !canGoNext && styles.disabled, pressed && styles.pressed]}
        >
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.grid}>
        {WEEKDAYS.map((d, i) => (
          <View key={`h${i}`} style={styles.cell}>
            <Text style={styles.weekday}>{d}</Text>
          </View>
        ))}
        {cells.map((ymd, i) => {
          if (!ymd) return <View key={`b${i}`} style={styles.cell} />;
          const day = Number(ymd.slice(8));
          const future = ymd > maxDate;
          const selected = ymd === value;
          const isToday = ymd === today;
          const hasDot = marked?.has(ymd);
          return (
            <View key={ymd} style={styles.cell}>
              <Pressable
                onPress={() => onChange(ymd)}
                disabled={future}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: future }}
                accessibilityLabel={`${day} ${MONTHS[month.getMonth()]}${isToday ? ', today' : ''}${hasDot ? ', already logged' : ''}`}
                style={({ pressed }) => [
                  styles.day,
                  isToday && !selected && styles.dayToday,
                  selected && { backgroundColor: colors.accent, borderColor: colors.accent },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.dayText, future && styles.dayFuture, selected && styles.dayTextOn]}>{day}</Text>
                {hasDot ? <View style={[styles.dot, selected && { backgroundColor: colors.white }]} /> : null}
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  box: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: space(3),
    marginTop: space(3),
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space(2) },
  nav: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  navText: { color: colors.text, fontSize: 20, fontWeight: '700', lineHeight: 22 },
  disabled: { opacity: 0.3 },
  pressed: { opacity: 0.6 },
  month: { color: colors.text, fontSize: 16, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 2 },
  weekday: { color: colors.textMuted, fontSize: 12, fontWeight: '700', paddingVertical: space(1) },
  day: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayToday: { borderColor: colors.text },
  dayText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  dayTextOn: { color: colors.white, fontWeight: '800' },
  dayFuture: { color: colors.textMuted, opacity: 0.4 },
  dot: { position: 'absolute', bottom: 4, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent },
}));
