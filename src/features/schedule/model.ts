// The Schedule tool's pure parts: its views and look-ahead windows, the look-ahead's grouping (MDR's shape: what is
// underway, then each week's new starts), labels, search and the item ids. Days are the job's calendar days
// (yyyy-MM-dd); display goes through lib/dates. Tested in model.test.ts.
import type { Activity, SourceKind, VersionRow } from '../../data/schedule.types';
import { formatDay } from '../../lib/dates';
import { shiftDay } from '../../lib/deliveries';
import { DRAFT_ITEM_PREFIX, VERSION_ITEM_PREFIX } from '../../lib/itemIds';
import { weekOf } from '../../lib/timesheet';

export const VIEWS = [
  { value: 'lookahead', label: 'Look-ahead' },
  { value: 'activities', label: 'Activities' },
  { value: 'updates', label: 'Updates' },
] as const;
export type ScheduleView = (typeof VIEWS)[number]['value'];

export function parseView(v: unknown): ScheduleView {
  return v === 'activities' || v === 'updates' ? v : 'lookahead';
}

/** The look-ahead's windows: this week and the next two, or this week and the next eight (about two months). */
export const RANGES = [
  { value: '3w', label: '3 weeks', weeks: 3 },
  { value: '2m', label: '2 months', weeks: 9 },
] as const;
export type Range = (typeof RANGES)[number]['value'];

export function parseRange(v: unknown): Range {
  return v === '2m' ? '2m' : '3w';
}

/** Done: finished, or 100%. */
function isDone(a: Activity): boolean {
  return a.actual_finish !== null || (a.percent ?? 0) >= 100;
}

function finishOf(a: Activity): string | null {
  return a.finish_date ?? a.start_date;
}

interface Week {
  /** Monday. */
  start: string;
  items: Activity[];
}

interface LookAhead {
  /** Started before this week and not finished (MDR's carryover). */
  underway: Activity[];
  /** Each week's new starts, Monday to Sunday. */
  weeks: Week[];
}

/** The window from this week's Monday: what is underway, then each week's starts, by start (file order on a tie). */
export function lookAhead(activities: readonly Activity[], today: string, range: Range): LookAhead {
  const monday = weekOf(today);
  const count = RANGES.find((r) => r.value === range)?.weeks ?? 3;
  const end = shiftDay(monday, count * 7);
  const open = activities.filter((a) => a.start_date !== null && !isDone(a));
  const byStart = (a: Activity, b: Activity) => (a.start_date ?? '').localeCompare(b.start_date ?? '') || a.sort - b.sort;
  const underway = open.filter((a) => (a.start_date ?? '') < monday && (finishOf(a) ?? '') >= monday).sort(byStart);
  const weeks: Week[] = Array.from({ length: count }, (_, i) => ({ start: shiftDay(monday, i * 7), items: [] }));
  for (const a of [...open].sort(byStart)) {
    const start = a.start_date ?? '';
    if (start < monday || start >= end) continue;
    weeks[Math.floor(dayDiff(monday, start) / 7)]?.items.push(a);
  }
  return { underway, weeks };
}

/** Whole days from `from` to `to`. */
function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** "This week" or "Next week"; later weeks go by their dates (null). */
export function weekLabel(start: string, today: string): string | null {
  const monday = weekOf(today);
  if (start === monday) return 'This week';
  return start === shiftDay(monday, 7) ? 'Next week' : null;
}

/** A week's days: "Oct 5 – 11", or "Sep 28 – Oct 4" across a month. */
export function weekSpan(start: string): string {
  const end = shiftDay(start, 6);
  return `${formatDay(start, 'MMM d')} – ${formatDay(end, start.slice(0, 7) === end.slice(0, 7) ? 'd' : 'MMM d')}`;
}

/** "Oct 6", or "Oct 6 – Oct 17"; a milestone is its one day. */
export function dateSpan(a: Pick<Activity, 'start_date' | 'finish_date' | 'is_milestone'>): string {
  if (a.start_date === null) return 'No date';
  const start = formatDay(a.start_date, 'MMM d');
  if (a.is_milestone || a.finish_date === null || a.finish_date === a.start_date) return start;
  return `${start} – ${formatDay(a.finish_date, 'MMM d')}`;
}

const SOURCE_LABELS: Record<SourceKind, string> = {
  xer: 'P6 XER',
  msp_xml: 'Project XML',
  csv: 'CSV',
  pdf: 'PDF',
  photo: 'Photo',
  excel: 'Excel',
};

export function sourceLabel(kind: SourceKind): string {
  return SOURCE_LABELS[kind];
}

/** "Update 3", or "Draft" before it is published. */
export function versionName(v: Pick<VersionRow, 'number' | 'status'>): string {
  return v.status === 'draft' || v.number === null ? 'Draft' : `Update ${String(v.number)}`;
}

/** Search the list: the name, the Activity ID, the area, the trade or the WBS, any word in any order. */
export function matches(a: Activity, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = [a.name, a.activity_code, a.area, a.trade, a.wbs].filter(Boolean).join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** The item ids: a draft's review (a page of its own), a published version, else an activity (a uuid). */
export function draftItemId(versionId: string): string {
  return `${DRAFT_ITEM_PREFIX}${versionId}`;
}

export function versionItemId(versionId: string): string {
  return `${VERSION_ITEM_PREFIX}${versionId}`;
}

type ScheduleItemRef = { kind: 'draft' | 'version' | 'activity'; id: string };

export function itemRef(itemId: string): ScheduleItemRef {
  if (itemId.startsWith(DRAFT_ITEM_PREFIX)) return { kind: 'draft', id: itemId.slice(DRAFT_ITEM_PREFIX.length) };
  if (itemId.startsWith(VERSION_ITEM_PREFIX)) return { kind: 'version', id: itemId.slice(VERSION_ITEM_PREFIX.length) };
  return { kind: 'activity', id: itemId };
}

/**
 * The file kinds the one Upload button offers (the server decides what the file is). Only what it reads: an Excel sheet
 * or a Project .mpp would only be told to come back as CSV or XML (_shared/schedule/detect.ts).
 */
export const UPLOAD_ACCEPT = '.xer,.xml,.csv,.pdf,application/pdf,text/csv,text/xml,application/xml,image/*';
