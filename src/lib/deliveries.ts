// Deliveries logic shared by the board, the post form and the e2e mock (SPEC §13.3). Pure functions; nothing here
// shows a time (display goes through lib/dates). Days are the job's calendar days as 'yyyy-MM-dd'.
import { addDays, format, getDay, lastDayOfMonth, parseISO } from 'date-fns';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MINUTE_MS = 60_000;

function day(d: string): Date {
  if (!DAY.test(d)) throw new Error(`Not a calendar day: ${d}`);
  return parseISO(d);
}

/** The calendar day n days after (or before, n < 0) `d`. */
export function shiftDay(d: string, n: number): string {
  return format(addDays(day(d), n), 'yyyy-MM-dd');
}

/** The Sunday that starts the week holding `d`. */
function weekStart(d: string): string {
  return shiftDay(d, -getDay(day(d)));
}

/** The board: three weeks, Sunday first, starting with the week that holds `anchor`. */
export function threeWeekDays(anchor: string): string[] {
  const start = weekStart(anchor);
  return Array.from({ length: 21 }, (_, i) => shiftDay(start, i));
}

/** Every day of the month holding `d`, first to last. */
export function monthDays(d: string): string[] {
  const first = `${d.slice(0, 7)}-01`;
  const last = format(lastDayOfMonth(day(first)), 'yyyy-MM-dd');
  const days: string[] = [];
  for (let cur = first; cur <= last; cur = shiftDay(cur, 1)) days.push(cur);
  return days;
}

/** How many deliveries each day has. */
export function countByDay(rows: readonly { delivery_date: string }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.delivery_date, (out.get(r.delivery_date) ?? 0) + 1);
  return out;
}

interface Timed {
  number: number;
  starts_at: string | null;
}

/** A day's order: by time, TBD last, then by receipt number. */
export function byTime<T extends Timed>(a: T, b: T): number {
  if (a.starts_at === b.starts_at) return a.number - b.number;
  if (a.starts_at === null) return 1;
  if (b.starts_at === null) return -1;
  return Date.parse(a.starts_at) - Date.parse(b.starts_at);
}

interface Slot {
  starts_at: string | null;
  duration_min: number;
}

/** When a delivery ends, as a UTC instant in ms. */
export function endMs(startsAt: string, durationMin: number): number {
  return Date.parse(startsAt) + durationMin * MINUTE_MS;
}

/**
 * The first delivery the candidate overlaps, or null. Half-open ranges, like the database (delivery_overlaps):
 * 7:00-8:00 and 8:00-9:00 do not overlap, and a time TBD overlaps nothing. `rows` are the live deliveries of the day;
 * pass `exceptId` when editing so a delivery never overlaps itself.
 */
export function findOverlap<T extends Slot & { id?: string | undefined }>(
  rows: readonly T[],
  candidate: Slot,
  exceptId?: string,
): T | null {
  if (candidate.starts_at === null) return null;
  const start = Date.parse(candidate.starts_at);
  const end = start + candidate.duration_min * MINUTE_MS;
  for (const r of rows) {
    if (r.starts_at === null || (exceptId !== undefined && r.id === exceptId)) continue;
    const rs = Date.parse(r.starts_at);
    if (rs < end && start < endMs(r.starts_at, r.duration_min)) return r;
  }
  return null;
}

/** Durations offered on the post form, in minutes. */
export const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480] as const;

/** 30 -> '30 min', 60 -> '1 hr', 90 -> '1.5 hr'. */
export function durationLabel(min: number): string {
  if (min < 60) return `${String(min)} min`;
  const h = min / 60;
  return `${Number.isInteger(h) ? String(h) : h.toFixed(1)} hr`;
}

/** The job's delivery link: /d/<project>?t=<token>, under the app's base path. */
export function deliveryLinkUrl(origin: string, basePath: string, projectId: string, token: string): string {
  return `${origin}${basePath.replace(/\/+$/, '')}/d/${encodeURIComponent(projectId)}?t=${encodeURIComponent(token)}`;
}
