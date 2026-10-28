// One place for the app's colours and spacing so every screen matches.
export const colors = {
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
