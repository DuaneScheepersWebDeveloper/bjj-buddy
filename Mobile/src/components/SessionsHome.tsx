import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../auth/AuthContext';
import { useSessions } from '../sessions/SessionsContext';
import { WeekWidget } from './WeekWidget';
import { startOfWeek, weekCounts, weekStreak } from '../lib/week';
import { radius, space } from '../theme';
import { makeStyles, useTheme } from '../ThemeContext';
import {
  ATTIRE_LABEL,
  SESSION_TYPE_LABEL,
  dateLabel,
  formatDuration,
  fromYMD,
  fullDate,
  toYMD,
  weekRangeLabel,
  type TrainingSession,
} from '../sessions/types';

const goalKey = (userId: number) => `bjjbuddy.sessions.weeklyGoal.${userId}`;
const DEFAULT_GOAL = 3;

/** Monday of the week `offset` weeks from this one (0 = this week, -1 = last week). */
function mondayOf(offset: number): Date {
  const m = startOfWeek(new Date());
  return new Date(m.getFullYear(), m.getMonth(), m.getDate() + offset * 7);
}

function weekTitle(offset: number, monday: Date): string {
  if (offset === 0) return 'This week';
  if (offset === -1) return 'Last week';
  return weekRangeLabel(monday);
}

/**
 * The training part of the home page: a big "Log a session" button, a week of training
 * (tap a day with a session to see it; ‹ › to look at earlier weeks).
 */
export function SessionsHome({ onLog, onOpen }: { onLog: () => void; onOpen: (id: string) => void }) {
  const styles = useStyles();
  const { user } = useAuth();
  const { sessions, ready } = useSessions();
  const userId = user?.id ?? 0;
  const [goal, setGoal] = useState(DEFAULT_GOAL);
  const [offset, setOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // The weekly goal is a personal setting, remembered on this phone.
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

  const monday = useMemo(() => mondayOf(offset), [offset]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)),
    [monday],
  );
  const dates = useMemo(() => sessions.map((s) => fromYMD(s.trained_on)), [sessions]);
  const counts = useMemo(() => weekCounts(dates, monday), [dates, monday]);
  const streak = useMemo(() => weekStreak(dates, goal), [dates, goal]);
  const total = counts.reduce((a, b) => a + b, 0);

  // Sessions in the week being looked at.
  const inWeek = useMemo(() => {
    const from = toYMD(days[0]);
    const to = toYMD(days[6]);
    return sessions.filter((s) => s.trained_on >= from && s.trained_on <= to);
  }, [sessions, days]);

  const selectedYMD = selectedDay != null ? toYMD(days[selectedDay]) : null;
  const daySessions = selectedYMD ? inWeek.filter((s) => s.trained_on === selectedYMD) : [];


  const goWeek = (n: number) => {
    setOffset(n);
    setSelectedDay(null);
  };
  const title = weekTitle(offset, monday);
  const reached = total >= goal;

  return (
    <View>
      <Pressable
        onPress={onLog}
        accessibilityRole="button"
        style={({ pressed }) => [styles.logBtn, pressed && styles.logBtnPressed]}
      >
        <Text style={styles.logPlus}>+</Text>
        <View>
          <Text style={styles.logTitle}>Log a session</Text>
          <Text style={styles.logSub}>What went right, what went wrong, your subs</Text>
        </View>
      </Pressable>

      {/* Week picker */}
      <View style={styles.weekNav}>
        <Pressable
          onPress={() => goWeek(offset - 1)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Previous week"
          style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]}
        >
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <View style={styles.navMid}>
          {offset === 0 ? (
            <Text style={styles.navTitle}>{fullDate(toYMD(new Date()))}</Text>
          ) : (
            <>
              <Text style={styles.navTitle}>{title}</Text>
              <Pressable onPress={() => goWeek(0)} hitSlop={8} accessibilityRole="button">
                <Text style={styles.navToday}>Back to today</Text>
              </Pressable>
            </>
          )}
        </View>
        <Pressable
          onPress={() => goWeek(offset + 1)}
          disabled={offset >= 0}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Next week"
          style={({ pressed }) => [styles.navBtn, offset >= 0 && styles.navDisabled, pressed && styles.pressed]}
        >
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>

      <WeekWidget
        title="Training"
        counts={counts}
        goal={goal}
        unit="session"
        streak={offset === 0 ? streak : 0}
        onChangeGoal={changeGoal}
        maxGoal={14}
        todayIndex={offset === 0 ? undefined : 7}
        dayNumbers={days.map((d) => d.getDate())}
        onDayPress={(i) => setSelectedDay((d) => (d === i ? null : i))}
        selectedDay={selectedDay}
        summary={
          offset === 0
            ? undefined
            : total === 0
              ? 'No training this week'
              : reached
                ? 'Goal reached that week'
                : `${goal - total} short of the goal that week`
        }
      />

      {/* The day you tapped */}
      {selectedYMD ? (
        <View style={styles.dayPanel}>
          <View style={styles.dayHeader}>
            <Text style={styles.dayTitle}>{fullDate(selectedYMD)}</Text>
            <Pressable onPress={() => setSelectedDay(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
              <Text style={styles.close}>×</Text>
            </Pressable>
          </View>
          {daySessions.length === 0 ? (
            <View style={[styles.card, styles.restCard]}>
              <Text style={styles.restTitle}>{selectedYMD === toYMD(new Date()) ? 'Rest day so far' : 'Rest day'}</Text>
              <Text style={styles.restText}>
                {selectedYMD === toYMD(new Date()) ? 'Nothing logged today yet.' : 'Recovery is part of training too.'}
              </Text>
              {selectedYMD === toYMD(new Date()) ? (
                <Pressable onPress={onLog} hitSlop={8} accessibilityRole="button" style={styles.restLink}>
                  <Text style={styles.restLinkText}>+ Log a session</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            daySessions.map((s) => <SessionCard key={s.id} session={s} onPress={() => onOpen(s.id)} />)
          )}
        </View>
      ) : null}

      {ready && sessions.length === 0 ? (
        <View style={[styles.card, styles.emptyCard]}>
          <Text style={styles.emptyTitle}>No sessions yet</Text>
          <Text style={styles.emptyText}>Log your first one after training. It takes about a minute.</Text>
        </View>
      ) : null}
    </View>
  );
}

function SessionCard({ session: s, onPress }: { session: TrainingSession; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${dateLabel(s.trained_on)}, ${s.location ?? 'training'}. ${s.subs_for} subs, tapped ${s.subs_against}. Open`}
      style={({ pressed }) => [styles.card, styles.row, pressed && styles.pressed]}
    >
      <View style={styles.flex}>
        <Text style={styles.rowDate}>{dateLabel(s.trained_on)}</Text>
        <Text style={styles.rowPlace} numberOfLines={1}>
          {s.location || SESSION_TYPE_LABEL[s.session_type]}
        </Text>
        <View style={styles.tags}>
          <Text style={styles.tag}>{ATTIRE_LABEL[s.attire]}</Text>
          <Text style={styles.tag}>{SESSION_TYPE_LABEL[s.session_type]}</Text>
          <Text style={styles.tag}>{formatDuration(s.duration_min)}</Text>
        </View>
        {s.unsynced ? <Text style={styles.unsynced}>● Saved on this phone</Text> : null}
      </View>
      <View style={styles.rowScore}>
        <Text style={styles.rowScoreText}>
          <Text style={{ color: colors.success }}>{s.subs_for}</Text>
          <Text style={styles.rowScoreDash}> – </Text>
          <Text style={{ color: colors.danger }}>{s.subs_against}</Text>
        </Text>
        <Text style={styles.chevron}>›</Text>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  logBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(4),
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: space(4),
    paddingHorizontal: space(5),
    marginBottom: space(5),
  },
  logBtnPressed: { backgroundColor: colors.accentPressed },
  logPlus: { color: colors.white, fontSize: 34, fontWeight: '300', lineHeight: 38 },
  logTitle: { color: colors.white, fontSize: 19, fontWeight: '900' },
  logSub: { color: colors.white, opacity: 0.85, fontSize: 13, marginTop: 2 },

  weekNav: { flexDirection: 'row', alignItems: 'center', marginBottom: space(3) },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navDisabled: { opacity: 0.3 },
  navText: { color: colors.text, fontSize: 22, fontWeight: '700', lineHeight: 24 },
  navMid: { flex: 1, alignItems: 'center' },
  navTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  navToday: { color: colors.accent, fontSize: 13, fontWeight: '700', marginTop: 2 },

  dayPanel: { marginBottom: space(2) },
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space(2) },
  dayTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  close: { color: colors.textMuted, fontSize: 24, paddingHorizontal: space(1) },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(5),
    marginBottom: space(4),
  },
  emptyCard: { alignItems: 'center' },
  restCard: { alignItems: 'center', paddingVertical: space(5) },
  restTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  restText: { color: colors.textMuted, fontSize: 14, marginTop: space(1) },
  restLink: { marginTop: space(3) },
  restLinkText: { color: colors.accent, fontSize: 15, fontWeight: '800' },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: space(1) },

  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(4), marginBottom: space(3) },
  rowDate: { color: colors.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  rowPlace: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space(1) + 2, marginTop: space(2) },
  tag: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: colors.surfaceRaised,
    borderRadius: 6,
    paddingHorizontal: space(2),
    paddingVertical: 2,
    overflow: 'hidden',
  },
  unsynced: { color: colors.warning, fontSize: 12, fontWeight: '700', marginTop: space(2) },
  rowScore: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  rowScoreText: { fontSize: 22, fontWeight: '900' },
  rowScoreDash: { color: colors.textMuted, fontWeight: '400' },
  chevron: { color: colors.textMuted, fontSize: 24 },
}));
