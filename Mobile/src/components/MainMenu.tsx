import { Animated, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { User } from '../lib/api';
import { menuItemsFor, type SectionId } from '../navigation/menuItems';
import { formatRank } from './BeltBadge';
import { Avatar } from './Avatar';
import { radius, space } from '../theme';
import { makeStyles } from '../ThemeContext';

type Props = {
  /** 0 = hidden, 1 = fully open. Owned by the screen so the button and menu animate together. */
  progress: Animated.Value;
  /** Whether the menu should be on screen at all (stays true while it animates closed). */
  mounted: boolean;
  /** Distance from the top of the screen to just below the menu button. */
  top: number;
  user: User | null;
  active: SectionId | null;
  onSelect: (id: SectionId) => void;
  onSignOut: () => void;
  onClose: () => void;
};

/** Dropdown panel that grows out of the top-right corner, over a dimmed backdrop. */
export function MainMenu({ progress, mounted, top, user, active, onSelect, onSignOut, onClose }: Props) {
  const styles = useStyles();
  const { width, height } = useWindowDimensions();
  if (!mounted) return null;

  const panelWidth = Math.min(320, width - space(8));
  // Never taller than the screen: the list scrolls inside the panel instead.
  const panelMaxHeight = height - top - space(6);

  const panelAnim = {
    opacity: progress,
    transform: [
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
    ],
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      </Animated.View>

      <Animated.View
        style={[styles.panel, { top, width: panelWidth, maxHeight: panelMaxHeight }, panelAnim]}
        accessibilityViewIsModal
        accessibilityLabel="Main menu"
      >
        <View style={styles.userRow}>
          <View style={styles.userBelt}>
            <Avatar url={user?.avatar_url} name={user?.full_name} belt={user?.belt_rank} size={40} />
          </View>
          <View style={styles.userText}>
            <Text style={styles.userName} numberOfLines={1}>{user?.full_name}</Text>
            <Text style={styles.userRank}>
              {formatRank(user?.belt_rank, user?.stripes)}
              {user?.role === 'admin' ? ' · Admin' : ''}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <ScrollView
          style={styles.scroll}
          bounces={false}
          showsVerticalScrollIndicator
          persistentScrollbar
          keyboardShouldPersistTaps="handled"
        >
          {menuItemsFor(user?.role).map((item, i, all) => {
            const isActive = item.id === active;
            const firstAdmin = item.adminOnly && !all[i - 1]?.adminOnly;
            return (
              <View key={item.id}>
                {firstAdmin ? (
                  <View style={styles.groupHeader}>
                    <View style={styles.divider} />
                    <Text style={styles.groupLabel}>ADMIN</Text>
                  </View>
                ) : null}
                <Pressable
                  onPress={() => onSelect(item.id)}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: isActive }}
                  style={({ pressed }) => [styles.item, (pressed || isActive) && styles.itemPressed]}
                >
                  <View style={[styles.marker, item.primary && styles.markerPrimary, isActive && styles.markerActive]} />
                  <View style={styles.itemText}>
                    <Text style={[styles.itemLabel, item.primary && styles.itemLabelPrimary]}>{item.label}</Text>
                    <Text style={styles.itemHint} numberOfLines={1}>{item.hint}</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              </View>
            );
          })}

          <View style={styles.divider} />

          <Pressable
            onPress={onSignOut}
            accessibilityRole="menuitem"
            style={({ pressed }) => [styles.item, styles.signOut, pressed && styles.itemPressed]}
          >
            <Text style={styles.signOutText}>Log out</Text>
          </Pressable>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  scroll: { flexGrow: 0, flexShrink: 1 },
  backdrop: { backgroundColor: colors.overlay },
  panel: {
    position: 'absolute',
    right: space(5),
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space(2),
    transformOrigin: 'top right',
    shadowColor: '#000',
    shadowOpacity: colors.shadowOpacity,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space(4), paddingVertical: space(3) },
  userBelt: { marginRight: space(3) },
  userText: { flex: 1 },
  userName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  userRank: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: space(1) },
  groupHeader: { marginTop: space(1) },
  groupLabel: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    paddingHorizontal: space(4),
    paddingTop: space(2),
    paddingBottom: space(1),
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: space(4),
    paddingVertical: space(2),
  },
  itemPressed: { backgroundColor: colors.surfaceRaised },
  marker: { width: 3, alignSelf: 'stretch', borderRadius: 2, marginRight: space(3), backgroundColor: 'transparent' },
  markerPrimary: { backgroundColor: colors.accent },
  markerActive: { backgroundColor: colors.text },
  itemText: { flex: 1 },
  itemLabel: { color: colors.text, fontSize: 16, fontWeight: '600' },
  itemLabelPrimary: { fontWeight: '800' },
  itemHint: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  chevron: { color: colors.textMuted, fontSize: 22, marginLeft: space(2) },
  signOut: { minHeight: 48 },
  signOutText: { color: colors.danger, fontSize: 15, fontWeight: '600', paddingLeft: space(1) },
}));
