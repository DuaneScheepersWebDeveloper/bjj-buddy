import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  KeyboardAvoidingView,
  Platform,
  StatusBar as RNStatusBar,
  Text,
  View,
} from 'react-native';
import type { ScrollView } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { BeltMark } from '../components/BeltMark';
import { BeltBadge } from '../components/BeltBadge';
import { Avatar } from '../components/Avatar';
import { HamburgerButton } from '../components/HamburgerButton';
import { MainMenu } from '../components/MainMenu';
import { SectionPlaceholder } from './SectionPlaceholder';
import { ProfileScreen } from './ProfileScreen';
import { SettingsScreen } from './SettingsScreen';
import { LogSessionScreen } from './LogSessionScreen';
import { SessionsHome } from '../components/SessionsHome';
import { SyncStatus } from '../offline/SyncStatus';
import { AdminUsersScreen } from './AdminUsersScreen';
import { AdminTasksScreen } from './AdminTasksScreen';
import type { SectionId } from '../navigation/menuItems';
import { radius, space } from '../theme';
import { makeStyles, ThemedStatusBar } from '../ThemeContext';

// Space above the header so it clears the status bar / notch.
const HEADER_TOP =
  Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 24) + space(3) : Platform.OS === 'ios' ? 56 : space(5);
const BUTTON_SIZE = 48;
const MENU_TOP = HEADER_TOP + BUTTON_SIZE + space(2);
const USE_NATIVE_DRIVER = Platform.OS !== 'web';
// How far you scroll (in points) before the logo has fully faded.
const LOGO_FADE_DISTANCE = 48;

export function HomeScreen() {
  const styles = useStyles();
  const { user, signOut, refreshUser } = useAuth();
  const [section, setSection] = useState<SectionId | null>(null);
  // Which session Log a session should open for editing (null = log a new one).
  const [editSessionId, setEditSessionId] = useState<string | null>(null);
  // A page can take over the Android back button (e.g. Log a session steps back a page).
  const sectionBack = useRef<(() => boolean) | null>(null);
  const setSectionBack = useCallback((fn: (() => boolean) | null) => {
    sectionBack.current = fn;
  }, []);
  const scrollToTop = useCallback(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), []);
  const openLog = useCallback((id: string | null) => {
    setEditSessionId(id);
    setSection('logSession');
  }, []);

  // --- Menu open/close animation -------------------------------------------
  const progress = useRef(new Animated.Value(0)).current;

  // --- Logo fades out as you scroll, so page titles don't run into it --------
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
    useNativeDriver: USE_NATIVE_DRIVER,
  });
  const logoFade = {
    opacity: scrollY.interpolate({ inputRange: [0, LOGO_FADE_DISTANCE], outputRange: [1, 0], extrapolate: 'clamp' }),
    transform: [
      {
        translateY: scrollY.interpolate({
          inputRange: [0, LOGO_FADE_DISTANCE],
          outputRange: [0, -10],
          extrapolate: 'clamp',
        }),
      },
    ],
  };

  // Each page starts at the top, with the logo showing.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    scrollY.setValue(0);
  }, [section, scrollY]);
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
      if (sectionBack.current?.()) return true;
      if (section) {
        setSection(null);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [menuOpen, section, closeMenu]);

  // --- Content ----------------------------------------------------------------
  const rank = user?.belt_rank ?? 'White';
  const stripes = user?.stripes ?? 0;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
      <ThemedStatusBar />

      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.column}>
          {section === 'admin' && user?.role === 'admin' ? (
            <AdminUsersScreen onBack={() => setSection(null)} />
          ) : section === 'adminTasks' && user?.role === 'admin' ? (
            <AdminTasksScreen onBack={() => setSection(null)} />
          ) : section === 'profile' ? (
            <ProfileScreen onBack={() => setSection(null)} />
          ) : section === 'settings' ? (
            <SettingsScreen onBack={() => setSection(null)} />
          ) : section === 'logSession' ? (
            <LogSessionScreen
              key={editSessionId ?? 'new'}
              editId={editSessionId}
              onDone={() => setSection(null)}
              scrollToTop={scrollToTop}
              setBackHandler={setSectionBack}
            />
          ) : section && section !== 'admin' && section !== 'adminTasks' ? (
            <SectionPlaceholder section={section} onBack={() => setSection(null)} />
          ) : (
            <>
              <View style={[styles.card, styles.profileRow]}>
                <Avatar url={user?.avatar_url} name={user?.full_name} belt={rank} size={60} />
                <View style={styles.nameBlock}>
                  <Text style={styles.name} numberOfLines={1}>{user?.full_name}</Text>
                  {user?.gym ? (
                    <Text style={styles.gym} numberOfLines={1}>
                      {user.gym}
                    </Text>
                  ) : null}
                </View>
                <BeltBadge belt={rank} stripes={stripes} size="md" />
              </View>

              <SessionsHome onLog={() => openLog(null)} onOpen={(id) => openLog(id)} />
            </>
          )}
        </View>
      </Animated.ScrollView>

      {/* Offline / upload status, floating at the bottom of every page. */}
      <SyncStatus />

      <MainMenu
        progress={progress}
        mounted={menuMounted}
        top={MENU_TOP}
        user={user}
        active={section}
        onClose={() => closeMenu()}
        onSelect={(id) => {
          if (id === 'logSession') setEditSessionId(null);
          setSection(id);
          closeMenu();
        }}
        onSignOut={() => closeMenu(() => void signOut())}
      />

      {/* Header sits on top of the menu's backdrop so the button can close it. */}
      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerInner} pointerEvents="box-none">
          <Animated.View style={logoFade} pointerEvents="none">
            <BeltMark size="sm" />
          </Animated.View>
          <HamburgerButton
            progress={progress}
            open={menuOpen}
            onPress={() => (menuOpen ? closeMenu() : openMenu())}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((colors) => ({
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
  // Extra room at the bottom so the floating upload status never covers the last item.
  scroll: { flexGrow: 1, paddingHorizontal: space(5), paddingTop: MENU_TOP + space(8), paddingBottom: space(24) },
  column: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(5),
    marginBottom: space(6),
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  nameBlock: { flex: 1 },
  name: { color: colors.text, fontSize: 21, fontWeight: '800' },
  gym: { color: colors.textMuted, fontSize: 15, fontWeight: '600', marginTop: space(1) },
}));
