import { Pressable, Text, View } from 'react-native';
import { darkColors, lightColors, radius, space, type Palette } from '../theme';
import { makeStyles, useTheme, type ThemePreference } from '../ThemeContext';

const APPEARANCE: { id: ThemePreference; label: string; hint: string }[] = [
  { id: 'light', label: 'Light', hint: 'Light background' },
  { id: 'dark', label: 'Dark', hint: 'Dark background' },
  { id: 'system', label: 'System', hint: "Matches your phone's setting" },
];

/** App settings. For now: Appearance (light / dark / follow the phone). */
export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const styles = useStyles();
  const { preference, setPreference, scheme } = useTheme();

  return (
    <View>
      <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" style={styles.back}>
        <Text style={styles.backText}>‹ Home</Text>
      </Pressable>
      <Text style={styles.title}>Settings</Text>

      <Text style={styles.sectionLabel}>APPEARANCE</Text>
      <View style={styles.card}>
        <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel="Appearance">
          {APPEARANCE.map((opt) => {
            const selected = preference === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setPreference(opt.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`${opt.label}. ${opt.hint}`}
                style={({ pressed }) => [styles.option, selected && styles.optionOn, pressed && styles.pressed]}
              >
                <Preview kind={opt.id} />
                <Text style={[styles.optionLabel, selected && styles.optionLabelOn]}>{opt.label}</Text>
                <View style={[styles.radio, selected && styles.radioOn]}>
                  {selected ? <View style={styles.radioDot} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.note}>
          {preference === 'system'
            ? `Following your phone, which is set to ${scheme} right now.`
            : 'Saved on this device.'}
        </Text>
      </View>
    </View>
  );
}

/** A tiny picture of the app in that theme. "System" shows half light, half dark. */
function Preview({ kind }: { kind: ThemePreference }) {
  const styles = useStyles();
  if (kind === 'system') {
    return (
      <View style={[styles.preview, styles.previewSplit]}>
        <View style={styles.half}>
          <Mini palette={lightColors} />
        </View>
        <View style={[styles.half, styles.halfRight]}>
          <Mini palette={darkColors} shift />
        </View>
      </View>
    );
  }
  return (
    <View style={styles.preview}>
      <Mini palette={kind === 'light' ? lightColors : darkColors} />
    </View>
  );
}

function Mini({ palette, shift }: { palette: Palette; shift?: boolean }) {
  return (
    <View style={{ flex: 1, backgroundColor: palette.background, padding: 6, gap: 4 }}>
      {/* When showing the right half of a split preview, shift the content so both halves line up. */}
      <View style={{ marginLeft: shift ? -34 : 0, width: 68, gap: 4 }}>
        <View style={{ height: 4, width: 22, borderRadius: 2, backgroundColor: palette.accent }} />
        <View
          style={{
            height: 20,
            borderRadius: 4,
            backgroundColor: palette.surface,
            borderWidth: 1,
            borderColor: palette.border,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 4,
            gap: 3,
          }}
        >
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: palette.textMuted }} />
          <View style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: palette.text }} />
        </View>
        <View style={{ height: 3, width: 40, borderRadius: 2, backgroundColor: palette.textMuted }} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  back: { alignSelf: 'flex-start', paddingVertical: space(1), marginBottom: space(3) },
  backText: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
  title: { color: colors.text, fontSize: 30, fontWeight: '800', marginBottom: space(6) },
  sectionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginBottom: space(2) },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(4),
    marginBottom: space(6),
  },
  options: { flexDirection: 'row', gap: space(3) },
  option: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space(3),
    paddingHorizontal: space(2),
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: space(2),
  },
  optionOn: { borderColor: colors.accent },
  pressed: { opacity: 0.7 },
  preview: {
    width: 68,
    height: 52,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewSplit: { flexDirection: 'row' },
  half: { flex: 1, overflow: 'hidden' },
  halfRight: { borderLeftWidth: 1, borderLeftColor: colors.border },
  optionLabel: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
  optionLabelOn: { color: colors.text },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.accent },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  note: { color: colors.textMuted, fontSize: 13, marginTop: space(4), textAlign: 'center' },
}));
