// Time (SPEC §8.8, CLAUDE.md rule 14): store UTC, compute "today" and display dates in the PROJECT time zone.
import { format, parseISO, subDays } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/**
 * The zone this device is in, from the browser. Nobody picks a time zone by hand: this seeds the person's profile,
 * and a new job defaults to its creator's zone. Falls back to Pacific only if the browser reports nothing usable.
 */
export function detectZone(): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return typeof tz === 'string' && tz.includes('/') ? tz : 'America/Los_Angeles';
}

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

/** A calendar day from the database (yyyy-MM-dd, e.g. a bid date) shown as written: no instant, so no zone shift. */
export function formatDay(day: string, pattern: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Not a calendar day: ${day}`);
  return format(parseISO(day), pattern);
}

/** The last second of a calendar day (yyyy-MM-dd) in the given zone, as a UTC ISO string. */
export function endOfDayInZone(day: string, tz: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Not a calendar day: ${day}`);
  return fromZonedTime(`${day}T23:59:59`, tz).toISOString();
}

/** A UTC instant as the value of a datetime-local input, in the given zone (e.g. the job's bid due time). */
export function toZonedInput(date: string, tz: string): string {
  return formatInZone(date, tz, "yyyy-MM-dd'T'HH:mm");
}

/** A datetime-local input value, read in the given zone, as a UTC ISO string. Empty input = null. */
export function fromZonedInput(local: string, tz: string): string | null {
  if (local === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error(`Not a date and time: ${local}`);
  return fromZonedTime(`${local}:00`, tz).toISOString();
}

/** Monday 00:00 of the week holding `now`, in the given zone (e.g. the project's), as a UTC ISO string. */
export function weekStartInZone(tz: string, now: Date = new Date()): string {
  const isoWeekday = Number(formatInTimeZone(now, tz, 'i')); // 1 = Monday ... 7 = Sunday
  const monday = format(subDays(parseISO(todayInZone(tz, now)), isoWeekday - 1), 'yyyy-MM-dd');
  return fromZonedTime(`${monday}T00:00:00`, tz).toISOString();
}
