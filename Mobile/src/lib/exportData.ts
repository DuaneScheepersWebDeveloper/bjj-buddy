import { Platform, Share } from 'react-native';
import {
  ATTIRE_LABEL,
  OUTCOME_LABEL,
  SESSION_TYPE_LABEL,
  TRAIT_LABEL,
  type Focus,
  type TrainingSession,
} from '../sessions/types';

/**
 * Export your training log, so it's always yours (and readable by a spreadsheet or another app).
 *
 * - JSON: everything, exactly as stored (sessions, techniques, partners, focuses). Good for backups.
 * - CSV: one row per session, for Excel / Google Sheets.
 *
 * In the browser it downloads a file. On a phone it opens the share sheet, so you can save it
 * to Drive or Files, or email it to yourself (no extra app permissions needed).
 */

export type ExportFormat = 'json' | 'csv';

export function toJSON(sessions: TrainingSession[], focuses: Focus[], who: string | undefined): string {
  const strip = ({ unsynced, ...s }: TrainingSession) => s; // eslint-disable-line @typescript-eslint/no-unused-vars
  return JSON.stringify(
    {
      app: 'BJJ Buddy',
      format_version: 1,
      exported_at: new Date().toISOString(),
      athlete: who ?? null,
      focuses: focuses.map(({ unsynced, ...f }) => f), // eslint-disable-line @typescript-eslint/no-unused-vars
      sessions: sessions.map(strip),
    },
    null,
    2,
  );
}

/** A CSV cell: quoted if it holds a comma, quote or line break. */
function cell(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(sessions: TrainingSession[], focuses: Focus[]): string {
  const focusTitle = new Map(focuses.map((f) => [f.id, f.title]));
  const header = [
    'date',
    'location',
    'minutes',
    'attire',
    'type',
    'subs_for',
    'subs_against',
    'energy',
    'focus',
    'went_right',
    'went_wrong',
    'to_improve',
    'next_time',
    'hits',
    'conceded',
    'partners',
  ];
  const list = (s: TrainingSession, result: 'hit' | 'conceded') =>
    s.entries
      .filter((e) => e.result === result)
      .map((e) => (e.count > 1 ? `${e.name} x${e.count}` : e.name))
      .join('; ');
  const rows = [...sessions]
    .sort((a, b) => a.trained_on.localeCompare(b.trained_on))
    .map((s) =>
      [
        s.trained_on,
        s.location,
        s.duration_min,
        ATTIRE_LABEL[s.attire],
        SESSION_TYPE_LABEL[s.session_type],
        s.subs_for,
        s.subs_against,
        s.energy ?? '',
        s.focus_id ? focusTitle.get(s.focus_id) ?? '' : '',
        s.went_right,
        s.went_wrong,
        s.to_improve,
        s.adjustment,
        list(s, 'hit'),
        list(s, 'conceded'),
        (s.partners ?? [])
          .map((p) =>
            [p.name, ...p.traits.map((t) => TRAIT_LABEL[t]), p.outcome ? OUTCOME_LABEL[p.outcome] : null].filter(Boolean).join(' / '),
          )
          .join('; '),
      ]
        .map(cell)
        .join(','),
    );
  // ﻿ so Excel reads accents (e.g. "Kimura à la ...") correctly.
  return '﻿' + [header.join(','), ...rows].join('\r\n');
}

export async function exportData(
  format: ExportFormat,
  sessions: TrainingSession[],
  focuses: Focus[],
  who?: string,
): Promise<'downloaded' | 'shared' | 'cancelled'> {
  const text = format === 'json' ? toJSON(sessions, focuses, who) : toCSV(sessions, focuses);
  const name = `bjj-buddy-${new Date().toISOString().slice(0, 10)}.${format}`;

  if (Platform.OS === 'web') {
    const blob = new Blob([text], { type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'downloaded';
  }

  const result = await Share.share({ title: name, message: text });
  return result.action === Share.dismissedAction ? 'cancelled' : 'shared';
}
