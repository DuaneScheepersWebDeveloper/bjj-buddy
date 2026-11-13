import { Pressable, Text, View } from 'react-native';
import { radius, space } from '../theme';
import { makeStyles, useTheme } from '../ThemeContext';
import type { Focus } from '../sessions/types';
import type { FocusProgress, Insight } from '../insights/insights';

/** The dashboard's top card: your one focus and how far along it is. Tap to open Focus. */
export function FocusCard({ focus, progress, onPress }: { focus: Focus | null; progress: FocusProgress | null; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();

  if (!focus || !progress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.card, styles.empty, pressed && styles.pressed]}>
        <Text style={styles.kicker}>YOUR FOCUS</Text>
        <Text style={styles.emptyTitle}>Pick one thing to work on</Text>
        <Text style={styles.emptyText}>One focus at a time. The app counts your reps and tells you when to review it.</Text>
        <Text style={styles.cta}>Set a focus ›</Text>
      </Pressable>
    );
  }

  const tone = progress.status === 'review' ? colors.success : progress.status === 'stale' ? colors.warning : colors.textMuted;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Your focus: ${focus.title}. ${progress.reps} of ${progress.target} sessions. ${progress.suggestion}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.head}>
        <Text style={styles.kicker}>YOUR FOCUS</Text>
        <Text style={styles.count}>
          <Text style={styles.countBig}>{progress.reps}</Text>/{progress.target}
        </Text>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {focus.title}
      </Text>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${Math.max(4, Math.round(progress.fraction * 100))}%` },
            progress.status === 'review' && { backgroundColor: colors.success },
          ]}
        />
      </View>
      <Text style={[styles.suggestion, { color: progress.status === 'on_track' || progress.status === 'new' ? colors.text : tone }]} numberOfLines={2}>
        {progress.suggestion}
      </Text>
    </Pressable>
  );
}

/** One insight, quiet by design: a coloured edge, a title and a line. */
export function InsightCard({ insight }: { insight: Insight }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const edge = insight.tone === 'good' ? colors.success : insight.tone === 'nudge' ? colors.warning : '#2E7DD7';
  return (
    <View style={[styles.insight, { borderLeftColor: edge }]} accessibilityRole="text">
      <Text style={styles.insightTitle}>{insight.title}</Text>
      <Text style={styles.insightBody}>{insight.body}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  pressed: { opacity: 0.75 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: space(5),
    marginBottom: space(5),
  },
  empty: { borderStyle: 'dashed' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { color: colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  count: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
  countBig: { color: colors.text, fontSize: 20, fontWeight: '900' },
  title: { color: colors.text, fontSize: 21, fontWeight: '900', marginTop: space(1) },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised, overflow: 'hidden', marginTop: space(3) },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  suggestion: { fontSize: 14, fontWeight: '600', marginTop: space(3), lineHeight: 20 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '900', marginTop: space(1) },
  emptyText: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: space(1) },
  cta: { color: colors.accent, fontSize: 15, fontWeight: '800', marginTop: space(3) },

  insight: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    paddingVertical: space(3),
    paddingHorizontal: space(4),
    marginBottom: space(3),
  },
  insightTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  insightBody: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 2 },
}));
