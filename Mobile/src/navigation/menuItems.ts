/** The sections reachable from the main (hamburger) menu. Add new ones here. */
export type SectionId = 'logSession' | 'stats' | 'plan' | 'profile' | 'settings' | 'support';

export type MenuItem = {
  id: SectionId;
  label: string;
  hint: string;
  /** Highlighted as the main action. */
  primary?: boolean;
};

export const MENU_ITEMS: MenuItem[] = [
  { id: 'logSession', label: 'Log a session', hint: 'Record a class, open mat or drilling', primary: true },
  { id: 'stats', label: 'Stats', hint: 'Mat time, streaks and trends' },
  { id: 'plan', label: 'Your BJJ plan', hint: 'Goals and what to work on next' },
  { id: 'profile', label: 'Profile', hint: 'Belt, stripes and gym' },
  { id: 'settings', label: 'Settings', hint: 'Account and app preferences' },
  { id: 'support', label: 'Support', hint: 'Help, feedback and contact' },
];

export function menuItem(id: SectionId): MenuItem {
  return MENU_ITEMS.find((m) => m.id === id)!;
}
