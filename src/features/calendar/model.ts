// Calendar views (SPEC §7.6): which days show, the time range to load, and the day each line falls on in its OWN
// job's time zone (SPEC §8.8). Days are calendar days (yyyy-MM-dd); weeks start on Monday.
import { addDays, addMonths, endOfMonth, endOfWeek, format, isValid, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import type { CalendarLine, CalendarRange } from '../../data/calendar.types';
import { formatDay, formatInZone, startOfDayInZone } from '../../lib/dates';
import { STATUS, type StatusKey } from '../../lib/status';

export const CAL_VIEWS = ['week', 'day', 'month'] as const;
export type CalView = (typeof CAL_VIEWS)[number];

export const VIEW_LABELS: Record<CalView, string> = { week: 'Week', day: 'Day', month: 'Month' };

/** The right-column item id of the add form. */
export const NEW_LINE = 'new';

/** Week is the default in the field. */
export function parseCalView(v: string | undefined): CalView {
  return CAL_VIEWS.find((x) => x === v) ?? 'week';
}

const WEEK = { weekStartsOn: 1 } as const;
const ymd = (d: Date): string => format(d, 'yyyy-MM-dd');

/** The ?day= of the URL when it is a real calendar day, else null (today). */
export function parseDay(v: string | undefined): string | null {
  if (v === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = parseISO(v);
  return isValid(d) && ymd(d) === v ? v : null;
}

function shiftDay(day: string, n: number): string {
  return ymd(addDays(parseISO(day), n));
}

function daysBetween(first: Date, last: Date): string[] {
  const out: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) out.push(ymd(d));
  return out;
}

/** The days a view shows around the anchor day. Month: whole weeks covering the month. */
export function visibleDays(view: CalView, anchor: string): string[] {
  const a = parseISO(anchor);
  if (view === 'day') return [anchor];
  if (view === 'week') return daysBetween(startOfWeek(a, WEEK), endOfWeek(a, WEEK));
  return daysBetween(startOfWeek(startOfMonth(a), WEEK), endOfWeek(endOfMonth(a), WEEK));
}

/** Prev / Next. */
export function step(view: CalView, anchor: string, dir: 1 | -1): string {
  if (view === 'day') return shiftDay(anchor, dir);
  if (view === 'week') return shiftDay(anchor, 7 * dir);
  return ymd(addMonths(parseISO(anchor), dir));
}

/**
 * The instants to load for these days. Jobs sit in different zones (All my jobs), so load a day either side in UTC
 * and let lineDay() place each line; lines that land outside the visible days are dropped by bucketByDay.
 */
export function rangeFor(days: readonly string[]): CalendarRange {
  const first = days[0];
  const last = days[days.length - 1];
  if (first === undefined || last === undefined) throw new Error('No days to show');
  return { from: startOfDayInZone(shiftDay(first, -1), 'UTC'), to: startOfDayInZone(shiftDay(last, 2), 'UTC') };
}

/** The job-local day a line starts on. */
export function lineDay(line: Pick<CalendarLine, 'starts_at' | 'timezone'>): string {
  return formatInZone(line.starts_at, line.timezone, 'yyyy-MM-dd');
}

type Sortable = Pick<CalendarLine, 'starts_at' | 'timezone' | 'all_day' | 'title'>;

function byDayOrder(a: Sortable, b: Sortable): number {
  if (a.all_day !== b.all_day) return a.all_day ? -1 : 1;
  return a.starts_at.localeCompare(b.starts_at) || a.title.localeCompare(b.title);
}

/** Each visible day's lines, in its job's local day: all-day first, then by start, then title. */
export function bucketByDay<L extends Sortable>(lines: readonly L[], days: readonly string[]): Map<string, L[]> {
  const out = new Map<string, L[]>(days.map((d) => [d, []]));
  for (const line of lines) out.get(lineDay(line))?.push(line);
  for (const list of out.values()) list.sort(byDayOrder);
  return out;
}

/** "All day" or the start time in the job's zone. */
export function lineTime(line: Pick<CalendarLine, 'starts_at' | 'timezone' | 'all_day'>): string {
  return line.all_day ? 'All day' : formatInZone(line.starts_at, line.timezone, 'h:mm a');
}

export function rangeLabel(view: CalView, days: readonly string[], anchor: string): string {
  if (view === 'day') return formatDay(anchor, 'EEE, MMM d, yyyy');
  if (view === 'month') return formatDay(anchor, 'MMMM yyyy');
  const first = days[0] ?? anchor;
  const last = days[days.length - 1] ?? anchor;
  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  return `${formatDay(first, sameYear ? 'MMM d' : 'MMM d, yyyy')} – ${formatDay(last, 'MMM d, yyyy')}`;
}

/** A database status that has a lib/status color, or null (no dot). */
export function statusKey(status: string | null): StatusKey | null {
  if (status === null) return null;
  return (Object.keys(STATUS) as StatusKey[]).find((k) => k === status) ?? null;
}
