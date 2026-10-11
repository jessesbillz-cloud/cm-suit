// The compact month (ui/MonthCalendar; Jesse Oct 10: "it should all fit on the one screen ... the days that have
// something, when you click on them, expand underneath, just like My Daily Reports"): whole weeks, Monday first, and the
// open day's items as one extra row right under its week. Where the calendar is lives in the URL: `at` (any day of
// the shown month or week; absent = the open day, else today) and `day` (the open day; absent = none open).
// Days are calendar days (yyyy-MM-dd) in the job's zone; "today" comes from lib/dates. Pure; tested in monthGrid.test.ts.
import { addDays, addMonths, endOfMonth, endOfWeek, format, isValid, isWeekend, parseISO, startOfMonth, startOfWeek } from 'date-fns';

const WEEK = { weekStartsOn: 1 } as const;
const ymd = (d: Date): string => format(d, 'yyyy-MM-dd');

/** A real calendar day (yyyy-MM-dd), else null. */
export function parseDay(v: string | undefined): string | null {
  if (v === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = parseISO(v);
  return isValid(d) && ymd(d) === v ? v : null;
}

/** Every day from the Monday on or before the 1st to the Sunday on or after the last day of the anchor's month. */
export function monthDays(anchor: string): string[] {
  const a = parseISO(anchor);
  const out: string[] = [];
  const last = endOfWeek(endOfMonth(a), WEEK);
  for (let d = startOfWeek(startOfMonth(a), WEEK); d <= last; d = addDays(d, 1)) out.push(ymd(d));
  return out;
}

/** Saturday or Sunday: the grids draw those days lighter. */
export function isWeekendDay(day: string): boolean {
  return isWeekend(parseISO(day));
}

/** The days in rows of seven. */
export function weekRows(days: readonly string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
  return out;
}

type GridRow = { type: 'week'; days: string[] } | { type: 'open'; day: string };

/** The week rows with the open day's row right under its week; no open row when that day isn't shown. */
export function rowsWithOpen(weeks: readonly (readonly string[])[], open: string | null): GridRow[] {
  const out: GridRow[] = [];
  for (const days of weeks) {
    out.push({ type: 'week', days: [...days] });
    if (open !== null && days.includes(open)) out.push({ type: 'open', day: open });
  }
  return out;
}

/** The same day of the month before or after (the 31st becomes the month's last day). */
export function stepMonth(anchor: string, dir: 1 | -1): string {
  return ymd(addMonths(parseISO(anchor), dir));
}

export interface CalendarPlace {
  /** A day of the month (or week) shown. */
  anchor: string;
  /** The open day, or null. */
  open: string | null;
}

/** Where the calendar is from the URL: the anchor is `at`, else the open day, else today (the job's). */
export function placeFrom(search: { at?: string | null | undefined; day?: string | null | undefined }, today: string): CalendarPlace {
  const open = parseDay(search.day ?? undefined);
  return { anchor: parseDay(search.at ?? undefined) ?? open ?? today, open };
}

/** A tap on a day: the open day closes, any other day opens. The tapped day becomes the anchor, so the shown month (or
 *  week) stays put either way. */
export function pickDay(place: CalendarPlace, day: string): CalendarPlace {
  return { anchor: day, open: place.open === day ? null : day };
}

/** The URL's search for a place: `at` only when the open day (or today) doesn't already say it. */
export function placeSearch(place: CalendarPlace, today: string): { at?: string; day?: string } {
  return {
    ...(place.anchor === (place.open ?? today) ? {} : { at: place.anchor }),
    ...(place.open !== null ? { day: place.open } : {}),
  };
}
