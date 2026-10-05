// Calendar views (SPEC §7.6; MDR's schedule calendar): which days show, the time range to load, and the day each line
// falls on in its OWN job's time zone (SPEC §8.8). Days are calendar days (yyyy-MM-dd); weeks start on Monday. The day
// view became the selected day's detail under the grid (MDR), so the views are Month (the default) and Week.
import { addDays, addMonths, endOfMonth, endOfWeek, format, isValid, isWeekend, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import type { CalendarLine, CalendarRange } from '../../data/calendar.types';
import { formatDay, formatInZone, startOfDayInZone } from '../../lib/dates';
import { toolIsOn } from '../../lib/jobs';
import { STATUS, type StatusKey } from '../../lib/status';

export const CAL_VIEWS = ['month', 'week'] as const;
export type CalView = (typeof CAL_VIEWS)[number];

export const VIEW_LABELS: Record<CalView, string> = { month: 'Month', week: 'Week' };

/** Right-column items that are not a line: the add form, blocked time, the feed link. Lines and requests are ids. */
export const NEW_LINE = 'new';
export { BLOCK_ITEM, SUBSCRIBE_ITEM } from '../../lib/itemIds';

/** A request opened from the calendar: its job travels with it ("All my jobs" has no job in the address). */
export function requestItemId(projectId: string, requestId: string): string {
  return `ir.${projectId}.${requestId}`;
}

export function parseRequestItem(itemId: string): { projectId: string; requestId: string } | null {
  const m = /^ir\.([^.]+)\.([^.]+)$/.exec(itemId);
  return m?.[1] && m[2] ? { projectId: m[1], requestId: m[2] } : null;
}

/** The month is the default (MDR's schedule). */
export function parseCalView(v: string | undefined): CalView {
  return CAL_VIEWS.find((x) => x === v) ?? 'month';
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
  if (view === 'week') return daysBetween(startOfWeek(a, WEEK), endOfWeek(a, WEEK));
  return daysBetween(startOfWeek(startOfMonth(a), WEEK), endOfWeek(endOfMonth(a), WEEK));
}

/** Saturday or Sunday: the grids draw those days lighter. */
export function isWeekendDay(day: string): boolean {
  return isWeekend(parseISO(day));
}

/** Prev / Next. */
export function step(view: CalView, anchor: string, dir: 1 | -1): string {
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

interface CalendarJob {
  project_id: string;
  modules: readonly string[];
}

/** The lines a person sees: the types they checked; on "All my jobs" (projectId null) only jobs with the calendar on. */
export function visibleLines<L extends Pick<CalendarLine, 'kind' | 'project_id'>>(
  lines: readonly L[],
  types: readonly string[],
  jobs: readonly CalendarJob[],
  projectId: string | null,
): L[] {
  const on = new Set(types);
  const calendarJobs = new Set(jobs.filter((p) => toolIsOn('calendar', p.modules)).map((p) => p.project_id));
  return lines.filter((l) => on.has(l.kind) && (projectId !== null || calendarJobs.has(l.project_id)));
}

/** "All day" or the start time in the job's zone. */
export function lineTime(line: Pick<CalendarLine, 'starts_at' | 'timezone' | 'all_day'>): string {
  return line.all_day ? 'All day' : formatInZone(line.starts_at, line.timezone, 'h:mm a');
}

export function rangeLabel(view: CalView, days: readonly string[], anchor: string): string {
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

/** The jobs whose inspections the calendar shows: this one, or on "All my jobs" every job with the calendar on; each
 *  with inspections on. */
export function inspectionJobs(jobs: readonly CalendarJob[], projectId: string | null): string[] {
  return jobs
    .filter((p) => (projectId === null || p.project_id === projectId) && toolIsOn('calendar', p.modules) && toolIsOn('inspections', p.modules))
    .map((p) => p.project_id);
}

/** Share: the job's scheduling page, where its people request inspections (they sign in through their invite link). */
export function schedulingLink(origin: string, basePath: string, projectId: string): string {
  return `${origin}${basePath.replace(/\/+$/, '')}/p/${encodeURIComponent(projectId)}/inspections?view=week`;
}
