/** The sections reachable from the main (hamburger) menu. Add new ones here. */
export type SectionId = 'logSession' | 'stats' | 'plan' | 'profile' | 'settings' | 'support' | 'admin';

export type MenuItem = {
  id: SectionId;
  label: string;
  hint: string;
  /** Highlighted as the main action. */
  primary?: boolean;
  /** Only shown to admins. */
  adminOnly?: boolean;
};

export const MENU_ITEMS: MenuItem[] = [
  { id: 'logSession', label: 'Log a session', hint: 'Record a class, open mat or drilling', primary: true },
  { id: 'stats', label: 'Stats', hint: 'Mat time, streaks and trends' },
  { id: 'plan', label: 'Your BJJ plan', hint: 'Goals and what to work on next' },
  { id: 'profile', label: 'Profile', hint: 'Belt, stripes and gym' },
  { id: 'settings', label: 'Settings', hint: 'Account and app preferences' },
  { id: 'support', label: 'Support', hint: 'Help, feedback and contact' },
  { id: 'admin', label: 'Admin', hint: 'Manage users and access', adminOnly: true },
];

/** The menu items this user is allowed to see. */
export function menuItemsFor(role: string | undefined): MenuItem[] {
  return MENU_ITEMS.filter((m) => !m.adminOnly || role === 'admin');
}

export function menuItem(id: SectionId): MenuItem {
  return MENU_ITEMS.find((m) => m.id === id)!;
}
