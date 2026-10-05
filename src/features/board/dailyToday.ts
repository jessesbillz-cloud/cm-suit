// Today's reports at the top of All my jobs (SPEC §13.1, My Daily Reports' home): each job's state today, its chip and
// its one button, and the "#233 · Daily M-F" line. Pure, so it is unit-tested.
import type { DailyTodayRow } from '../../data/dailyToday.types';
import type { StatusKey } from '../../lib/status';
import { TODAY_LABELS, todayAction } from '../dailies/model';

type TodayState = 'submitted' | 'draft' | 'due' | 'off';

/** Submitted, or a draft with work in it; with none yet (or an untouched one), due on a schedule day and off on any other. */
export function todayState(row: Pick<DailyTodayRow, 'status' | 'scheduled_today' | 'report_version'>): TodayState {
  const action = todayAction(row.status === 'none' ? null : { status: row.status, version: row.report_version ?? 1 });
  if (action === 'edit') return 'submitted';
  if (action === 'continue') return 'draft';
  // An untouched report made today is due today, scheduled or not.
  return row.scheduled_today || row.status === 'draft' ? 'due' : 'off';
}

/** The chip and the card's left edge (lib/status colors only; due is yellow, SPEC §18.1 #9). */
export const TODAY_CHIPS: Record<TodayState, { status: StatusKey; label: string }> = {
  submitted: { status: 'confirmed', label: 'Submitted' },
  draft: { status: 'pending', label: 'Draft' },
  due: { status: 'pending', label: 'Not started' },
  off: { status: 'cancelled', label: 'Off today' },
};

/** The card's one button: the same words as the Dailies button (MDR's Start / Continue / Edit submitted). */
export const TODAY_ACTIONS: Record<TodayState, string> = {
  submitted: TODAY_LABELS.edit,
  draft: TODAY_LABELS.continue,
  due: TODAY_LABELS.start,
  off: TODAY_LABELS.start,
};

/** Day letters for a run ("Daily M-F") and names for a list ("Mon, Wed, Fri"), Sunday first (0 = Sunday). */
const LETTERS = ['Su', 'M', 'Tu', 'W', 'Th', 'F', 'Sa'] as const;
const NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** "Daily M-F", "Every day", "Mon, Wed, Fri", or "No schedule". */
export function scheduleLabel(days: readonly number[]): string {
  const list = [...new Set(days)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
  const first = list[0];
  const last = list[list.length - 1];
  if (first === undefined || last === undefined) return 'No schedule';
  if (list.length === 7) return 'Every day';
  if (list.length >= 3 && last - first === list.length - 1) return `Daily ${LETTERS[first] ?? ''}-${LETTERS[last] ?? ''}`;
  return list.map((d) => NAMES[d] ?? '').join(', ');
}

/** "#233 · Daily M-F": today's number (or the one it will get), then the schedule. */
export function todayMeta(row: Pick<DailyTodayRow, 'number' | 'next_number' | 'schedule_days'>): string {
  const n = row.number ?? row.next_number;
  return [n === null ? '' : `#${String(n)}`, scheduleLabel(row.schedule_days)].filter((p) => p !== '').join(' · ');
}
