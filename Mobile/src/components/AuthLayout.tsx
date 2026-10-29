import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { BeltMark } from './BeltMark';
import { useKeyboardVisible } from '../lib/useKeyboardVisible';
import { belts, colors, radius, space } from '../theme';

type Props = {
  title: string;
  subtitle: string;
  /** Shown above the form, e.g. an error message. */
  banner?: ReactNode;
  children: ReactNode;
  /** Shown under the card, e.g. "Back to sign in". */
  footer?: ReactNode;
};

/**
 * Shared frame for the sign-in, sign-up and password-reset screens.
 *
 * When the keyboard opens, the screen shrinks to the space above it and the
 * logo collapses, so the field being typed in stays visible.
 */
export function AuthLayout({ title, subtitle, banner, children, footer }: Props) {
  const keyboardOpen = useKeyboardVisible();

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      // Android apps are drawn edge-to-edge, so the window no longer shrinks for the
      // keyboard by itself; 'padding' does that job on both platforms.
      behavior={Platform.OS === 'web' ? undefined : 'padding'}
    >
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={[styles.scroll, keyboardOpen && styles.scrollKeyboard]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>
          <View style={[styles.header, keyboardOpen && styles.headerKeyboard]}>
            <BeltMark size={keyboardOpen ? 'sm' : 'lg'} />
            {keyboardOpen ? null : <Text style={styles.tagline}>Track every roll. See every stripe.</Text>}
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
            {banner}
            {children}
          </View>

          {keyboardOpen ? null : footer}

          {keyboardOpen ? null : (
            <View style={styles.beltRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {Object.values(belts).map((c) => (
                <View key={c} style={[styles.beltDot, { backgroundColor: c }]} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Red (error) or neutral (info) message box for the top of a form. */
export function Banner({ kind, message }: { kind: 'error' | 'info'; message: string }) {
  const error = kind === 'error';
  return (
    <View
      style={[styles.banner, error ? styles.bannerError : styles.bannerInfo]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Text style={[styles.bannerText, error ? styles.bannerTextError : styles.bannerTextInfo]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: space(5),
    paddingTop: space(16),
    paddingBottom: space(10),
  },
  // Keyboard open: start at the top with less padding so the form fits above the keyboard.
  scrollKeyboard: { justifyContent: 'flex-start', paddingTop: space(12), paddingBottom: space(4) },
  column: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  header: { alignItems: 'center', marginBottom: space(8) },
  headerKeyboard: { marginBottom: space(4) },
  tagline: { color: colors.textMuted, fontSize: 15, marginTop: space(3) },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(6),
  },
  title: { color: colors.text, fontSize: 24, fontWeight: '800', marginBottom: space(1) },
  subtitle: { color: colors.textMuted, fontSize: 15, marginBottom: space(6), lineHeight: 21 },
  banner: {
    borderLeftWidth: 3,
    borderRadius: radius.sm,
    paddingVertical: space(3),
    paddingHorizontal: space(3),
    marginBottom: space(4),
  },
  bannerError: { backgroundColor: colors.dangerSurface, borderLeftColor: colors.danger },
  bannerInfo: { backgroundColor: colors.surfaceRaised, borderLeftColor: colors.textMuted },
  bannerText: { fontSize: 14, lineHeight: 20 },
  bannerTextError: { color: colors.danger },
  bannerTextInfo: { color: colors.text },
  beltRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: space(8) },
  beltDot: { width: 22, height: 6, borderRadius: 3, borderWidth: 1, borderColor: colors.border },
});
