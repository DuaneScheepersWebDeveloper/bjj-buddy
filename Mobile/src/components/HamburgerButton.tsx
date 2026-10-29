import { Animated, Pressable, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

type Props = {
  /** 0 = closed (three bars), 1 = open (an X). Driven by the menu's animation. */
  progress: Animated.Value;
  open: boolean;
  onPress: () => void;
};

const BAR_GAP = 6;

/** Three-bar menu button that morphs into an X when the menu is open. */
export function HamburgerButton({ progress, open, onPress }: Props) {
  const topBar = {
    transform: [
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, BAR_GAP + 2] }) },
      { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }) },
    ],
  };
  const middleBar = {
    opacity: progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0, 0] }),
    transform: [{ scaleX: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.2] }) }],
  };
  const bottomBar = {
    transform: [
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -(BAR_GAP + 2)] }) },
      { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-45deg'] }) },
    ],
  };

  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={open ? 'Close menu' : 'Open menu'}
      accessibilityState={{ expanded: open }}
      style={({ pressed }) => [styles.button, open && styles.buttonOpen, pressed && styles.pressed]}
    >
      <Animated.View style={[styles.bar, topBar]} />
      <Animated.View style={[styles.bar, styles.gap, middleBar]} />
      <Animated.View style={[styles.bar, styles.gap, bottomBar]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonOpen: { backgroundColor: colors.surfaceRaised },
  pressed: { opacity: 0.7 },
  bar: { width: 22, height: 2, borderRadius: 1, backgroundColor: colors.text },
  gap: { marginTop: BAR_GAP },
});
