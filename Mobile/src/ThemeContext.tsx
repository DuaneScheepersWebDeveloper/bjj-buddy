import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors, type Palette } from './theme';

/** What the user picked in Settings. "system" follows the phone's own light/dark setting. */
export type ThemePreference = 'light' | 'dark' | 'system';
export type Scheme = 'light' | 'dark';

type ThemeValue = {
  /** The colours to draw with right now. */
  colors: Palette;
  /** The theme actually showing (System resolved to light or dark). */
  scheme: Scheme;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
};

// Saved on this device, so the choice is there before login and works offline.
const STORAGE_KEY = 'bjjbuddy.theme.v1';
// The app was designed dark first, so that's what new installs get.
const DEFAULT_PREFERENCE: ThemePreference = 'dark';

const ThemeContext = createContext<ThemeValue>({
  colors: darkColors,
  scheme: 'dark',
  preference: DEFAULT_PREFERENCE,
  setPreference: () => {},
});

const isPreference = (v: unknown): v is ThemePreference => v === 'light' || v === 'dark' || v === 'system';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme(); // 'light' | 'dark' | null (unknown)
  const [preference, setPref] = useState<ThemePreference>(DEFAULT_PREFERENCE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (isPreference(v)) setPref(v);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    setPref(p);
    AsyncStorage.setItem(STORAGE_KEY, p).catch(() => {});
  }, []);

  const scheme: Scheme = preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference;

  const value = useMemo<ThemeValue>(
    () => ({ colors: scheme === 'light' ? lightColors : darkColors, scheme, preference, setPreference }),
    [scheme, preference, setPreference],
  );

  // Wait (a few milliseconds) for the saved choice, so the app doesn't flash the wrong theme.
  if (!loaded) return null;
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

/**
 * Themed version of StyleSheet.create. Write styles as a function of the colours:
 *
 *   const useStyles = makeStyles((colors) => ({ card: { backgroundColor: colors.surface } }));
 *   function MyThing() { const styles = useStyles(); ... }
 *
 * Each palette's stylesheet is built once and reused.
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: Palette) => T & StyleSheet.NamedStyles<any>,
): () => T {
  const cache = new Map<Palette, T>();
  return function useStyles() {
    const { colors } = useTheme();
    let styles = cache.get(colors);
    if (!styles) {
      styles = StyleSheet.create(factory(colors)) as T;
      cache.set(colors, styles);
    }
    return styles;
  };
}

/** The phone's status bar (clock, battery) in the right colour for the current theme. */
export function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
}
