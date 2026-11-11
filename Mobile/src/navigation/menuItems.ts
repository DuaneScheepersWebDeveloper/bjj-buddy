/** The sections reachable from the main (hamburger) menu. Add new ones here. */
export type SectionId =
  | 'logSession'
  | 'stats'
  | 'plan'
  | 'profile'
  | 'settings'
  | 'support'
  | 'students'
  | 'admin'
  | 'adminTasks';

export type MenuItem = {
  id: SectionId;
  label: string;
  hint: string;
  /** Highlighted as the main action. */
  primary?: boolean;
  /** Only shown to admins (grouped under an "Admin" heading in the menu). */
  adminOnly?: boolean;
  /** Only shown to coaches and admins (grouped under a "Coach" heading). */
  coachOnly?: boolean;
};

export const MENU_ITEMS: MenuItem[] = [
  { id: 'logSession', label: 'Log a session', hint: 'Record a class, open mat or drilling', primary: true },
  { id: 'stats', label: 'Stats', hint: 'Mat time, streaks and trends' },
  { id: 'plan', label: 'Your BJJ plan', hint: 'Goals and what to work on next' },
  { id: 'profile', label: 'Profile', hint: 'Belt, stripes and gym' },
  { id: 'settings', label: 'Settings', hint: 'Light or dark mode and app preferences' },
  { id: 'support', label: 'Support', hint: 'Help, feedback and contact' },
  { id: 'students', label: 'Students', hint: 'Sessions, notes and promotions', coachOnly: true },
  { id: 'admin', label: 'Users', hint: 'Manage users and access', adminOnly: true },
  { id: 'adminTasks', label: 'Tasks', hint: 'Ideas and to-dos for admins', adminOnly: true },
];

/** The menu items this user is allowed to see. */
export function menuItemsFor(role: string | undefined): MenuItem[] {
  const coach = role === 'coach' || role === 'admin';
  return MENU_ITEMS.filter((m) => (!m.adminOnly || role === 'admin') && (!m.coachOnly || coach));
}

export function menuItem(id: SectionId): MenuItem {
  return MENU_ITEMS.find((m) => m.id === id)!;
}
