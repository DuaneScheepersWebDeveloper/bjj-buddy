/**
 * Insights: small, rule-based observations from your own logs. No AI and no server, so they
 * work offline and are instant. Each rule needs a minimum amount of data before it says
 * anything, so it never draws conclusions from one or two sessions.
 *
 * Everything here is a pure function of (sessions, focuses, today): easy to test, and easy to
 * add rules to. Add a rule by writing a function that returns Insight | null and listing it
 * in `insights()`.
 */

import {
  TRAIT_LABEL,
  daysAgo,
  fromYMD,
  toYMD,
  type Focus,
  type PartnerTrait,
  type TrainingSession,
} from '../sessions/types';

export type Tone = 'good' | 'nudge' | 'info';

export type Insight = {
  id: string;
  tone: Tone;
  title: string;
  body: string;
  /** Higher shows first. */
  priority: number;
};

/** Days from a to b ("YYYY-MM-DD"). */
export function daysBetween(a: string, b: string): number {
  return Math.round((fromYMD(b).getTime() - fromYMD(a).getTime()) / 86_400_000);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// --- Focus ---------------------------------------------------------------------------

/** Days without a rep on your focus before the app nudges you. */
export const FOCUS_STALE_DAYS = 10;

export type FocusProgress = {
  /** Sessions where you worked on it. */
  reps: number;
  target: number;
  /** 0..1 */
  fraction: number;
  lastRepOn: string | null;
  /** Your most recent "one thing to change" while on this focus. */
  lastAdjustment: string | null;
  daysActive: number;
  /** review = target reached; stale = not worked on lately; on_track otherwise. */
  status: 'new' | 'on_track' | 'review' | 'stale';
  /** One short line to show under the focus. */
  suggestion: string;
};

export function focusProgress(focus: Focus, sessions: TrainingSession[], today = toYMD(new Date())): FocusProgress {
  const on = sessions
    .filter((s) => s.focus_id === focus.id)
    .sort((a, b) => b.trained_on.localeCompare(a.trained_on) || b.created_at.localeCompare(a.created_at));
  const reps = on.length;
  const target = Math.max(1, focus.target_sessions);
  const lastRepOn = on[0]?.trained_on ?? null;
  const lastAdjustment = on.find((s) => s.adjustment)?.adjustment ?? null;
  const daysActive = Math.max(0, daysBetween(focus.started_on, today));
  const sinceRep = daysBetween(lastRepOn ?? focus.started_on, today);

  let status: FocusProgress['status'] = 'on_track';
  let suggestion: string;
  if (reps >= target) {
    status = 'review';
    suggestion = `${plural(reps, 'session')} in. Time to review: got it, or keep going?`;
  } else if (sinceRep >= FOCUS_STALE_DAYS) {
    status = 'stale';
    suggestion = lastRepOn
      ? `No reps in ${sinceRep} days. Make it your first roll next class, or swap it.`
      : `Started ${sinceRep} days ago with no reps yet. Still the right focus?`;
  } else if (reps === 0) {
    status = 'new';
    suggestion = 'Log a session where you work on it to start the count.';
  } else {
    const left = target - reps;
    suggestion = lastAdjustment
      ? `Next time: ${lastAdjustment}`
      : `${plural(left, 'more session')} until review.`;
  }
  return { reps, target, fraction: Math.min(1, reps / target), lastRepOn, lastAdjustment, daysActive, status, suggestion };
}

/** Ideas for a next focus, from what's going wrong most often lately. */
export function focusSuggestions(sessions: TrainingSession[], today = toYMD(new Date()), limit = 4): string[] {
  const since = toYMD(daysAgo(45, fromYMD(today)));
  const conceded = new Map<string, number>();
  for (const s of sessions) {
    if (s.trained_on < since) continue;
    for (const e of s.entries) {
      if (e.result !== 'conceded') continue;
      conceded.set(e.name, (conceded.get(e.name) ?? 0) + e.count);
    }
  }
  const ideas = [...conceded.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => `Defending the ${name.toLowerCase()}`);
  for (const fallback of ['Guard retention', 'Escaping side control', 'Passing half guard', 'Finishing from the back']) {
    if (ideas.length >= limit) break;
    if (!ideas.some((i) => i.toLowerCase().includes(fallback.toLowerCase()))) ideas.push(fallback);
  }
  return ideas;
}

// --- Streak --------------------------------------------------------------------------

/** Monday of the week containing `d`. */
function mondayOf(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
}

/**
 * Weeks in a row with at least one session. The current week counts if you've trained in it;
 * if you haven't yet, the streak isn't broken until the week ends.
 */
export function weekStreak(sessions: TrainingSession[], today = toYMD(new Date())): { weeks: number; trainedThisWeek: boolean } {
  const weeks = new Set(sessions.map((s) => toYMD(mondayOf(fromYMD(s.trained_on)))));
  let monday = mondayOf(fromYMD(today));
  const trainedThisWeek = weeks.has(toYMD(monday));
  if (!trainedThisWeek) monday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7);
  let count = 0;
  while (weeks.has(toYMD(monday))) {
    count++;
    monday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7);
  }
  return { weeks: count, trainedThisWeek };
}

// --- Rules ---------------------------------------------------------------------------

/** Techniques you used to hit (2+ times) but haven't in 21+ days. */
export function coldTechniques(sessions: TrainingSession[], today = toYMD(new Date()), days = 21) {
  const last = new Map<string, { name: string; on: string; total: number }>();
  for (const s of sessions) {
    for (const e of s.entries) {
      if (e.result !== 'hit') continue;
      const key = e.name.toLowerCase();
      const cur = last.get(key);
      last.set(key, {
        name: e.name,
        on: !cur || s.trained_on > cur.on ? s.trained_on : cur.on,
        total: (cur?.total ?? 0) + e.count,
      });
    }
  }
  return [...last.values()]
    .filter((t) => t.total >= 2 && daysBetween(t.on, today) >= days)
    .map((t) => ({ ...t, daysCold: daysBetween(t.on, today) }))
    .sort((a, b) => b.total - a.total);
}

function coldRule(sessions: TrainingSession[], today: string): Insight | null {
  // Only meaningful if you're still training.
  if (!sessions.some((s) => daysBetween(s.trained_on, today) <= 14)) return null;
  const cold = coldTechniques(sessions, today);
  if (!cold.length) return null;
  const t = cold[0];
  return {
    id: `cold:${t.name}`,
    tone: 'nudge',
    title: `${t.name} has gone cold`,
    body: `You've hit it ${plural(t.total, 'time')}, but not in ${t.daysCold} days.${cold.length > 1 ? ` Also cold: ${cold.slice(1, 3).map((c) => c.name).join(', ')}.` : ''}`,
    priority: 40,
  };
}

/** Per partner trait: how often you get tapped. Needs 4+ rolls with an outcome. */
export function partnerTraitStats(sessions: TrainingSession[]) {
  const stats = new Map<PartnerTrait, { rolls: number; tappedBy: number; tappedThem: number }>();
  let rolls = 0;
  let tappedBy = 0;
  for (const s of sessions) {
    for (const p of s.partners ?? []) {
      if (!p.outcome) continue;
      rolls++;
      if (p.outcome === 'tapped_by') tappedBy++;
      for (const t of p.traits) {
        const cur = stats.get(t) ?? { rolls: 0, tappedBy: 0, tappedThem: 0 };
        cur.rolls++;
        if (p.outcome === 'tapped_by') cur.tappedBy++;
        if (p.outcome === 'tapped_them') cur.tappedThem++;
        stats.set(t, cur);
      }
    }
  }
  return { byTrait: stats, overall: { rolls, tappedBy, rate: rolls ? tappedBy / rolls : 0 } };
}

function partnerRule(sessions: TrainingSession[]): Insight | null {
  const { byTrait, overall } = partnerTraitStats(sessions);
  let best: { trait: PartnerTrait; rolls: number; tappedBy: number; rate: number } | null = null;
  for (const [trait, s] of byTrait) {
    if (s.rolls < 4) continue;
    const rate = s.tappedBy / s.rolls;
    // Clearly worse than your usual (by 20+ points), and the worst trait so far.
    if (rate >= overall.rate + 0.2 && rate >= 0.5 && (!best || rate > best.rate)) best = { trait, ...s, rate };
  }
  if (!best) return null;
  const who = TRAIT_LABEL[best.trait].toLowerCase();
  return {
    id: `partner:${best.trait}`,
    tone: 'info',
    title: `${TRAIT_LABEL[best.trait]} partners are your hardest rolls`,
    body: `Tapped in ${best.tappedBy} of ${best.rolls} rolls with ${who} partners, vs ${Math.round(overall.rate * 100)}% overall. Worth a focus?`,
    priority: 50,
  };
}

function energyRule(sessions: TrainingSession[]): Insight | null {
  const rated = sessions.slice(0, 40).filter((s) => s.energy != null);
  // Three tired sessions in a row is worth saying first.
  const last3 = rated.slice(0, 3);
  if (last3.length === 3 && last3.every((s) => (s.energy as number) <= 2)) {
    return {
      id: 'energy:low-run',
      tone: 'nudge',
      title: 'Running on empty',
      body: 'Your last 3 sessions felt tiring. A lighter session, more sleep or better fuel before class might pay off.',
      priority: 60,
    };
  }
  const low = rated.filter((s) => (s.energy as number) <= 2);
  const high = rated.filter((s) => (s.energy as number) >= 4);
  if (low.length < 3 || high.length < 3) return null;
  const avg = (list: TrainingSession[]) => list.reduce((n, s) => n + s.subs_against, 0) / list.length;
  const a = avg(low);
  const b = avg(high);
  if (a < b + 0.75) return null;
  return {
    id: 'energy:taps',
    tone: 'info',
    title: 'Fatigue shows up in your taps',
    body: `On tired days you get tapped ${a.toFixed(1)}× per session, vs ${b.toFixed(1)}× when you feel good.`,
    priority: 45,
  };
}

/** Where most of your taps come from lately (needs 6+ taps). */
function positionRule(sessions: TrainingSession[], today: string): Insight | null {
  const since = toYMD(daysAgo(30, fromYMD(today)));
  const byPos = new Map<string, number>();
  let total = 0;
  for (const s of sessions) {
    if (s.trained_on < since) continue;
    for (const e of s.entries) {
      if (e.result !== 'conceded' || e.category !== 'submission') continue;
      byPos.set(e.position, (byPos.get(e.position) ?? 0) + e.count);
      total += e.count;
    }
  }
  if (total < 6) return null;
  const [pos, n] = [...byPos.entries()].sort((a, b) => b[1] - a[1])[0];
  if (n / total < 0.6) return null;
  const where = pos === 'bottom' ? 'from underneath' : pos === 'top' ? 'while on top' : 'standing';
  return {
    id: `position:${pos}`,
    tone: 'info',
    title: `Most taps happen ${where}`,
    body: `${n} of your last ${total} taps (30 days) were ${where}.`,
    priority: 35,
  };
}

/** Kinds of technique you haven't hit in a while, e.g. no sweeps in 30 days of training. */
function neglectedRule(sessions: TrainingSession[], today: string): Insight | null {
  const since = toYMD(daysAgo(30, fromYMD(today)));
  const recent = sessions.filter((s) => s.trained_on >= since);
  if (recent.length < 5) return null;
  const hitKinds = new Set(recent.flatMap((s) => s.entries.filter((e) => e.result === 'hit').map((e) => e.category)));
  const everHit = new Set(sessions.flatMap((s) => s.entries.filter((e) => e.result === 'hit').map((e) => e.category)));
  const label: Record<string, string> = { sweep: 'sweeps', pass: 'guard passes', escape: 'escapes', takedown: 'takedowns', submission: 'submissions' };
  for (const kind of ['sweep', 'pass', 'escape', 'submission']) {
    if (everHit.has(kind as never) && !hitKinds.has(kind as never)) {
      return {
        id: `neglected:${kind}`,
        tone: 'nudge',
        title: `No ${label[kind]} logged lately`,
        body: `None in your last ${plural(recent.length, 'session')} (30 days). Skipping them, or just not logging them?`,
        priority: 30,
      };
    }
  }
  return null;
}

function streakRule(sessions: TrainingSession[], today: string): Insight | null {
  const { weeks, trainedThisWeek } = weekStreak(sessions, today);
  if (weeks < 2) return null;
  return trainedThisWeek
    ? { id: 'streak', tone: 'good', title: `${weeks} weeks in a row`, body: 'Consistency is the whole game. Keep it going.', priority: 20 }
    : {
        id: 'streak:at-risk',
        tone: 'nudge',
        title: `Keep your ${weeks}-week streak`,
        body: 'No session logged this week yet. One class keeps it alive.',
        priority: 55,
      };
}

/** Every insight that applies right now, most useful first. */
export function insights(sessions: TrainingSession[], today = toYMD(new Date())): Insight[] {
  if (sessions.length < 3) return [];
  return [
    energyRule(sessions),
    streakRule(sessions, today),
    partnerRule(sessions),
    coldRule(sessions, today),
    positionRule(sessions, today),
    neglectedRule(sessions, today),
  ]
    .filter((x): x is Insight => x !== null)
    .sort((a, b) => b.priority - a.priority);
}

// --- Micro-feedback after saving ----------------------------------------------------

export type Feedback = { tone: Tone; text: string };

/**
 * A few short lines right after you save a session: progress, firsts and comebacks.
 * `others` = your sessions not counting the one just saved.
 */
export function feedbackFor(saved: TrainingSession, others: TrainingSession[], focus: Focus | null): Feedback[] {
  const out: Feedback[] = [];
  const today = saved.trained_on;

  if (focus && saved.focus_id === focus.id) {
    const p = focusProgress(focus, [saved, ...others.filter((s) => s.id !== saved.id)], today);
    out.push(
      p.reps >= p.target
        ? { tone: 'good', text: `${focus.title}: ${p.reps}/${p.target}. Target reached, time to review it.` }
        : { tone: 'good', text: `${focus.title}: rep ${p.reps} of ${p.target}.` },
    );
  }

  for (const e of saved.entries) {
    if (e.result !== 'hit') continue;
    const before = others
      .filter((s) => s.trained_on <= today && s.entries.some((x) => x.result === 'hit' && x.name.toLowerCase() === e.name.toLowerCase()))
      .map((s) => s.trained_on)
      .sort()
      .pop();
    if (!before) {
      if (others.length >= 3) out.push({ tone: 'good', text: `First ${e.name} on record. Nice.` });
    } else if (daysBetween(before, today) >= 21) {
      out.push({ tone: 'good', text: `${e.name} is back after ${daysBetween(before, today)} days.` });
    }
    if (out.length >= 3) break;
  }

  const { weeks } = weekStreak([saved, ...others], today);
  const { weeks: weeksBefore } = weekStreak(others, today);
  if (weeks >= 2 && weeks > weeksBefore) out.push({ tone: 'good', text: `${weeks} weeks in a row.` });

  if (saved.energy != null && saved.energy <= 2) {
    const recent = others.filter((s) => s.energy != null).slice(0, 2);
    if (recent.length === 2 && recent.every((s) => (s.energy as number) <= 2)) {
      out.push({ tone: 'nudge', text: 'Third tiring session in a row. Look after recovery.' });
    }
  }

  if (!out.length) out.push({ tone: 'info', text: `Session ${others.length + 1} logged. Every rep counts.` });
  return out.slice(0, 3);
}
