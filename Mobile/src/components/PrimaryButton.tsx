import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius } from '../theme';

type Props = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'solid' | 'outline';
};

export function PrimaryButton({ title, onPress, loading, disabled, variant = 'solid' }: Props) {
  const outline = variant === 'outline';
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        outline ? styles.outline : styles.solid,
        pressed && (outline ? styles.outlinePressed : styles.solidPressed),
        inactive && styles.inactive,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={outline ? colors.text : colors.white} />
      ) : (
        <Text style={[styles.text, outline && styles.outlineText]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 54,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  solid: { backgroundColor: colors.accent },
  solidPressed: { backgroundColor: colors.accentPressed },
  outline: { borderWidth: 1.5, borderColor: colors.border, backgroundColor: 'transparent' },
  outlinePressed: { backgroundColor: colors.surfaceRaised },
  inactive: { opacity: 0.6 },
  text: { color: colors.white, fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  outlineText: { color: colors.text },
});
