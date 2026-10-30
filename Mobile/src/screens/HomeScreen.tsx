import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Platform,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../auth/AuthContext';
import { BeltMark } from '../components/BeltMark';
import { BeltBadge, formatRank } from '../components/BeltBadge';
import { HamburgerButton } from '../components/HamburgerButton';
import { MainMenu } from '../components/MainMenu';
import { SectionPlaceholder } from './SectionPlaceholder';
import { AdminUsersScreen } from './AdminUsersScreen';
import type { SectionId } from '../navigation/menuItems';
import { colors, radius, space } from '../theme';

// Space above the header so it clears the status bar / notch.
const HEADER_TOP =
  Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 24) + space(3) : Platform.OS === 'ios' ? 56 : space(5);
const BUTTON_SIZE = 48;
const MENU_TOP = HEADER_TOP + BUTTON_SIZE + space(2);
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

export function HomeScreen() {
  const { user, signOut, refreshUser } = useAuth();
  const [section, setSection] = useState<SectionId | null>(null);

  // --- Menu open/close animation -------------------------------------------
  const progress = useRef(new Animated.Value(0)).current;
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);

  const openMenu = useCallback(() => {
    refreshUser().catch(() => {}); // pick up role changes made by an admin
    setMenuMounted(true);
    setMenuOpen(true);
    Animated.timing(progress, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [progress, refreshUser]);

  const closeMenu = useCallback(
    (then?: () => void) => {
      setMenuOpen(false);
      Animated.timing(progress, {
        toValue: 0,
        duration: 170,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start(({ finished }) => {
        if (finished) setMenuMounted(false);
        then?.();
      });
    },
    [progress],
  );

  // Android back button: close the menu first, then leave a section.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (menuOpen) {
        closeMenu();
        return true;
      }
      if (section) {
        setSection(null);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [menuOpen, section, closeMenu]);

  // --- Content ----------------------------------------------------------------
  const firstName = user?.full_name.split(' ')[0] ?? 'there';
  const rank = user?.belt_rank ?? 'White';
  const stripes = user?.stripes ?? 0;

  return (
    <View style={styles.flex}>
      <StatusBar style="light" />

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.column}>
          {section === 'admin' && user?.role === 'admin' ? (
            <AdminUsersScreen onBack={() => setSection(null)} />
          ) : section && section !== 'admin' ? (
            <SectionPlaceholder section={section} onBack={() => setSection(null)} />
          ) : (
            <>
              <Text style={styles.greeting}>Oss, {firstName}.</Text>
              <Text style={styles.sub}>Open the menu in the top corner to get started.</Text>

              <View style={styles.card}>
                <Text style={styles.cardLabel}>Current rank</Text>
                <View style={styles.rankRow}>
                  <BeltBadge belt={rank} stripes={stripes} size="lg" />
                </View>
                <Text style={styles.rankText}>{formatRank(rank, stripes)}</Text>
                <Text style={styles.email}>{user?.email}</Text>
              </View>
            </>
          )}
        </View>
      </ScrollView>

      <MainMenu
        progress={progress}
        mounted={menuMounted}
        top={MENU_TOP}
        user={user}
        active={section}
        onClose={() => closeMenu()}
        onSelect={(id) => {
          setSection(id);
          closeMenu();
        }}
        onSignOut={() => closeMenu(() => void signOut())}
      />

      {/* Header sits on top of the menu's backdrop so the button can close it. */}
      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerInner} pointerEvents="box-none">
          <BeltMark size="sm" />
          <HamburgerButton
            progress={progress}
            open={menuOpen}
            onPress={() => (menuOpen ? closeMenu() : openMenu())}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: HEADER_TOP,
    paddingHorizontal: space(5),
    zIndex: 10,
    elevation: 13,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scroll: { flexGrow: 1, paddingHorizontal: space(5), paddingTop: MENU_TOP + space(8), paddingBottom: space(10) },
  column: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  greeting: { color: colors.text, fontSize: 32, fontWeight: '800' },
  sub: { color: colors.textMuted, fontSize: 16, marginTop: space(2), marginBottom: space(8) },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(5),
    marginBottom: space(6),
  },
  cardLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '600', letterSpacing: 0.4, marginBottom: space(3) },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  rankText: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: space(3) },
  email: { color: colors.textMuted, fontSize: 14, marginTop: space(3) },
});
