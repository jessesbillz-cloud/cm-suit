// Time (SPEC §8.8, CLAUDE.md rule 14): store UTC, compute "today" and display dates in the PROJECT time zone.
import { parseISO } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/** Today's calendar date (yyyy-MM-dd) in the given IANA zone, e.g. the project's. */
export function todayInZone(tz: string, now: Date = new Date()): string {
  return formatInTimeZone(now, tz, 'yyyy-MM-dd');
}

/** Formats a UTC instant (Date or ISO 8601 string from the database) for display in the given zone. */
export function formatInZone(date: Date | string, tz: string, pattern: string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (Number.isNaN(d.getTime())) throw new Error(`Not a date: ${String(date)}`);
  return formatInTimeZone(d, tz, pattern);
}

/** The last second of a calendar day (yyyy-MM-dd) in the given zone, as a UTC ISO string. */
export function endOfDayInZone(day: string, tz: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Not a calendar day: ${day}`);
  return fromZonedTime(`${day}T23:59:59`, tz).toISOString();
}
