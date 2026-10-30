/** Week helpers for the weekly widget. Weeks run Monday to Sunday, in the phone's local time. */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight at the start of the Monday of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const mondayOffset = (d.getDay() + 6) % 7; // Mon=0 ... Sun=6
  d.setDate(d.getDate() - mondayOffset);
  return d;
}

/** 0 = Monday ... 6 = Sunday. */
export function dayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/** How many of `dates` fall on each day (Mon..Sun) of the week containing `now`. */
export function weekCounts(dates: (string | Date)[], now = new Date()): number[] {
  const start = startOfWeek(now).getTime();
  const end = start + 7 * DAY_MS;
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const raw of dates) {
    const d = typeof raw === 'string' ? new Date(raw) : raw;
    const t = d.getTime();
    if (t >= start && t < end) counts[dayIndex(d)]++;
  }
  return counts;
}

/**
 * Weeks in a row the goal was reached. The current week only counts once it's reached,
 * and doesn't break the streak while it's still in progress.
 */
export function weekStreak(dates: (string | Date)[], goal: number, now = new Date()): number {
  if (goal <= 0) return 0;
  const perWeek = new Map<number, number>();
  for (const raw of dates) {
    const d = typeof raw === 'string' ? new Date(raw) : raw;
    const key = startOfWeek(d).getTime();
    perWeek.set(key, (perWeek.get(key) ?? 0) + 1);
  }
  let week = startOfWeek(now);
  let streak = 0;
  if ((perWeek.get(week.getTime()) ?? 0) >= goal) streak++;
  // Walk back one week at a time (setDate copes with daylight-saving changes).
  for (;;) {
    week = new Date(week.getFullYear(), week.getMonth(), week.getDate() - 7);
    if ((perWeek.get(week.getTime()) ?? 0) >= goal) streak++;
    else break;
  }
  return streak;
}
