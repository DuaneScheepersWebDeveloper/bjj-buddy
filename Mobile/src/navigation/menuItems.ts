/** The sections reachable from the main (hamburger) menu. Add new ones here. */
export type SectionId =
  | 'logSession'
  | 'stats'
  | 'statsFitness'
  | 'statsBjj'
  | 'focus'
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
  /** A sub-menu item: shown indented under this item, which opens and closes like a folder. */
  parent?: SectionId;
};

export const MENU_ITEMS: MenuItem[] = [
  { id: 'logSession', label: 'Log a session', hint: 'Quick log: tap or talk, under a minute', primary: true },
  { id: 'focus', label: 'Focus', hint: 'The one thing you are working on' },
  { id: 'stats', label: 'Stats', hint: 'Fitness and BJJ progress' },
  { id: 'statsFitness', label: 'Fitness', hint: 'Weight and water', parent: 'stats' },
  { id: 'statsBjj', label: 'BJJ progress', hint: 'Your training over time', parent: 'stats' },
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

/** True if this item has sub-menu items (it opens them instead of a page). */
export function hasChildren(id: SectionId): boolean {
  return MENU_ITEMS.some((m) => m.parent === id);
}

export function menuItem(id: SectionId): MenuItem {
  return MENU_ITEMS.find((m) => m.id === id)!;
}
