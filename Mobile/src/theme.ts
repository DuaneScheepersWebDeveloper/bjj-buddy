// One place for the app's colours and spacing so every screen matches.
// There are two palettes, dark and light. Screens get the current one from
// useTheme() / makeStyles() in ThemeContext.tsx; never import a palette directly into a screen.

export type Palette = {
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  borderFocus: string;
  text: string;
  textMuted: string;
  accent: string;
  accentPressed: string;
  danger: string;
  dangerSurface: string;
  white: string;
  /** Green for "done" / "active" states. */
  success: string;
  /** Amber for "waiting" states. */
  warning: string;
  /** Dims the page behind the menu and pop-ups. */
  overlay: string;
  /** Drop shadow strength for floating things (menu, upload status). */
  shadowOpacity: number;
  /** A white belt drawn on this background (the ring round a profile picture, the loader). */
  whiteBelt: string;
};

export const darkColors: Palette = {
  background: '#0E1014',
  surface: '#171A20',
  surfaceRaised: '#1E222A',
  border: '#2A2F39',
  borderFocus: '#C8102E',
  text: '#F4F2EE',
  textMuted: '#8C92A0',
  accent: '#C8102E', // the red bar on a black belt
  accentPressed: '#A00D25',
  danger: '#FF6B6B',
  dangerSurface: '#2A1517',
  white: '#FFFFFF',
  success: '#4CC38A',
  warning: '#E8A33D',
  overlay: 'rgba(5, 6, 8, 0.6)',
  shadowOpacity: 0.4,
  whiteBelt: '#F4F2EE',
};

export const lightColors: Palette = {
  background: '#F3F2EF',
  surface: '#FFFFFF',
  surfaceRaised: '#ECEBE7',
  border: '#DAD8D2',
  borderFocus: '#C8102E',
  text: '#15171C',
  textMuted: '#626977',
  accent: '#C8102E',
  accentPressed: '#A00D25',
  danger: '#C62828',
  dangerSurface: '#FCEBEB',
  white: '#FFFFFF',
  success: '#1F8A57',
  warning: '#B97411',
  overlay: 'rgba(20, 22, 28, 0.35)',
  shadowOpacity: 0.14,
  whiteBelt: '#D9D5CB',
};

// Belt colours, used for the logo stripe and rank badges.
export const belts: Record<string, string> = {
  White: '#F4F2EE',
  Blue: '#1F5FBF',
  Purple: '#6B3FA0',
  Brown: '#7A4A2A',
  Black: '#111111',
};

export const radius = { sm: 8, md: 12, lg: 16 };
export const space = (n: number) => n * 4;
