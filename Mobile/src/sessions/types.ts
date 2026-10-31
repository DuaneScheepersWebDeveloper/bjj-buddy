/** Shapes and helpers for training sessions (match Backend/app/routers/sessions.py). */

export type Attire = 'gi' | 'nogi';
export type SessionType = 'class' | 'open_mat' | 'private' | 'competition';
export type Category = 'submission' | 'pass' | 'sweep' | 'escape' | 'takedown' | 'position';
export type Position = 'standing' | 'top' | 'bottom';
/** hit = you pulled it off; conceded = it was done to you. */
export type Result = 'hit' | 'conceded';

export type Technique = {
  id?: number;
  name: string;
  category: Category;
  position: Position;
  /** One the user added themselves. */
  custom?: boolean;
};

export type Entry = {
  name: string;
  category: Category;
  position: Position;
  result: Result;
  count: number;
  technique_id?: number | null;
};

/** What the phone sends (PUT /sessions/{id}). */
export type SessionDraft = {
  id: string;
  /** "YYYY-MM-DD", the day you trained (local time). */
  trained_on: string;
  location: string | null;
  duration_min: number;
  attire: Attire;
  session_type: SessionType;
  went_right: string | null;
  went_wrong: string | null;
  to_improve: string | null;
  entries: Entry[];
  created_at: string;
};

/** A session as shown in the app (from the server, or saved on the phone waiting to upload). */
export type TrainingSession = SessionDraft & {
  subs_for: number;
  subs_against: number;
  updated_at: string;
  /** Saved on this phone, not uploaded yet. */
  unsynced?: boolean;
};

export const ATTIRE_LABEL: Record<Attire, string> = { gi: 'Gi', nogi: 'No-Gi' };

export const SESSION_TYPES: { id: SessionType; label: string }[] = [
  { id: 'class', label: 'Class' },
  { id: 'open_mat', label: 'Open mat' },
  { id: 'private', label: 'Private' },
  { id: 'competition', label: 'Competition' },
];
export const SESSION_TYPE_LABEL = Object.fromEntries(SESSION_TYPES.map((t) => [t.id, t.label])) as Record<
  SessionType,
  string
>;

export const CATEGORY_LABEL: Record<Category, string> = {
  submission: 'Submissions',
  pass: 'Passes',
  sweep: 'Sweeps',
  escape: 'Escapes',
  takedown: 'Takedowns',
  position: 'Positions',
};
/** Singular, for "Add as a ..." */
export const CATEGORY_ONE: Record<Category, string> = {
  submission: 'Submission',
  pass: 'Pass',
  sweep: 'Sweep',
  escape: 'Escape',
  takedown: 'Takedown',
  position: 'Position',
};
export const POSITION_LABEL: Record<Position, string> = { standing: 'Standing', top: 'Top', bottom: 'Bottom' };
export const POSITIONS: Position[] = ['standing', 'top', 'bottom'];

export const MAX_NOTES = 2000;

/** Subs you got and times you tapped, from a list of entries. */
export function tally(entries: Entry[]): { subsFor: number; subsAgainst: number } {
  let subsFor = 0;
  let subsAgainst = 0;
  for (const e of entries) {
    if (e.category !== 'submission') continue;
    if (e.result === 'hit') subsFor += e.count;
    else subsAgainst += e.count;
  }
  return { subsFor, subsAgainst };
}

// --- Dates (sessions use plain local dates, "YYYY-MM-DD") --------------------------

const pad = (n: number) => String(n).padStart(2, '0');

export function toYMD(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "2026-10-31" -> local midnight on that day (not UTC, which can land on the day before). */
export function fromYMD(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function daysAgo(n: number, now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - n);
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Thu 29 Oct 2026" */
export function dateLabel(ymd: string): string {
  const d = fromYMD(ymd);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Thursday 29 October 2026" */
export function fullDate(ymd: string): string {
  const d = fromYMD(ymd);
  return `${LONG_DAYS[d.getDay()]} ${d.getDate()} ${LONG_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Today, Sat 31 Oct", "Yesterday, Fri 30 Oct", "Thu 29 Oct 2026". */
export function dayLabel(ymd: string, now = new Date()): string {
  const d = fromYMD(ymd);
  const short = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  if (ymd === toYMD(now)) return `Today, ${short}`;
  if (ymd === toYMD(daysAgo(1, now))) return `Yesterday, ${short}`;
  return `${short} ${d.getFullYear()}`;
}

/** "27 Oct – 2 Nov" for the week starting on `monday`. */
export function weekRangeLabel(monday: Date): string {
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const left = monday.getMonth() === sunday.getMonth() ? `${monday.getDate()}` : `${monday.getDate()} ${MONTHS[monday.getMonth()]}`;
  return `${left} – ${sunday.getDate()} ${MONTHS[sunday.getMonth()]}`;
}

/** Short chip label: "Today", "Yesterday", "Thu 29". */
export function shortDayLabel(ymd: string, now = new Date()): string {
  if (ymd === toYMD(now)) return 'Today';
  if (ymd === toYMD(daysAgo(1, now))) return 'Yesterday';
  const d = fromYMD(ymd);
  return `${DAYS[d.getDay()]} ${d.getDate()}`;
}

/** 90 -> "1 h 30 min", 60 -> "1 h", 45 -> "45 min". */
export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
