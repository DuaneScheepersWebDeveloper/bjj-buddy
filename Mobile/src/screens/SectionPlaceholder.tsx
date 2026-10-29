import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { menuItem, type SectionId } from '../navigation/menuItems';
import { colors, radius, space } from '../theme';

/** Stand-in for menu sections that haven't been built yet. Replace one at a time. */
export function SectionPlaceholder({ section, onBack }: { section: SectionId; onBack: () => void }) {
  const item = menuItem(section);
  return (
    <View>
      <Text style={styles.title}>{item.label}</Text>
      <Text style={styles.hint}>{item.hint}</Text>

      <View style={styles.card}>
        <Text style={styles.badge}>COMING SOON</Text>
        <Text style={styles.body}>This part of BJJ Buddy hasn't been built yet.</Text>
      </View>

      <PrimaryButton title="Back to home" variant="outline" onPress={onBack} />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 30, fontWeight: '800' },
  hint: { color: colors.textMuted, fontSize: 16, marginTop: space(2), marginBottom: space(8) },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    padding: space(6),
    alignItems: 'center',
    marginBottom: space(6),
  },
  badge: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginBottom: space(2) },
  body: { color: colors.textMuted, fontSize: 15, textAlign: 'center' },
});
