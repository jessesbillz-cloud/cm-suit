// Times, lengths, days and slot conflicts for inspection requests. Pure; tested in time.test.ts.
// Days are calendar days (yyyy-MM-dd) in the job's zone; "today" comes from lib/dates. Date math only: every label
// that shows a date goes through lib/dates.
import { addDays, endOfMonth, format, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import type { DurationKind } from '../../data/inspections.types';

export const FLEXIBLE = 'flexible';
const FIRST_SLOT = 6 * 60;
const LAST_SLOT = 18 * 60;
const DAY = 24 * 60;

/** Minutes after midnight from "HH:mm" or "HH:mm:ss". */
export function minutesOf(t: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) throw new Error(`Not a time: ${t}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** "Flexible", or "1:30 PM". */
export function clockLabel(t: string | null): string {
  if (t === null) return 'Flexible';
  const min = minutesOf(t);
  const h = Math.floor(min / 60);
  return `${String(((h + 11) % 12) + 1)}:${String(min % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Flexible, then every half hour from 6:00 AM to 6:00 PM. */
export const TIME_OPTIONS: readonly { value: string; label: string }[] = [
  { value: FLEXIBLE, label: 'Flexible' },
  ...Array.from({ length: (LAST_SLOT - FIRST_SLOT) / 30 + 1 }, (_, i) => {
    const value = hhmm(FIRST_SLOT + i * 30);
    return { value, label: clockLabel(value) };
  }),
];

/** "HH:mm" (or "HH:mm:ss" from the database) as a TIME_OPTIONS value. */
export function timeValue(t: string | null): string {
  return t === null ? FLEXIBLE : t.slice(0, 5);
}

export const DURATIONS: readonly { value: string; label: string; kind: DurationKind; min: number | null }[] = [
  { value: '5', label: '5 min', kind: 'timed', min: 5 },
  { value: '15', label: '15 min', kind: 'timed', min: 15 },
  { value: '30', label: '30 min', kind: 'timed', min: 30 },
  { value: '60', label: '1 hr', kind: 'timed', min: 60 },
  { value: '90', label: '1.5 hr', kind: 'timed', min: 90 },
  { value: '120', label: '2 hr', kind: 'timed', min: 120 },
  { value: '180', label: '3 hr', kind: 'timed', min: 180 },
  { value: '240', label: '4 hr', kind: 'timed', min: 240 },
  { value: 'all_day', label: 'All day', kind: 'all_day', min: null },
  { value: 'periodic', label: 'Periodic / as needed', kind: 'periodic', min: null },
];

export const DEFAULT_DURATION = '60';

export function durationValue(kind: string, min: number | null): string {
  return kind === 'timed' ? String(min ?? 60) : kind;
}

export function durationOf(value: string): { kind: DurationKind; min: number | null } {
  const d = DURATIONS.find((x) => x.value === value);
  if (!d) throw new Error(`Unknown length: ${value}`);
  return { kind: d.kind, min: d.min };
}

export function durationLabel(kind: string, min: number | null): string {
  const d = DURATIONS.find((x) => x.value === durationValue(kind, min));
  if (d) return d.label;
  return `${String(min ?? 0)} min`;
}

interface SpanInput {
  start_time: string | null;
  duration_kind: string;
  duration_min: number | null;
}

interface Span {
  start: number;
  end: number;
}

/** The part of the day a booking takes. null = Flexible (fits anywhere). All day = the whole day. */
export function spanOf(r: SpanInput): Span | null {
  if (r.duration_kind === 'all_day') return { start: 0, end: DAY };
  if (r.start_time === null) return null;
  const start = minutesOf(r.start_time);
  const length = r.duration_kind === 'timed' ? (r.duration_min ?? 30) : 30;
  return { start, end: Math.min(DAY, start + length) };
}

export interface ConflictRow extends SpanInput {
  id: string | null;
  status: string;
  status_key: string;
  is_block: boolean;
}

/**
 * The bookings a request at this time would overlap. A postponed request has freed its slot; a returned one never
 * held it. Flexible overlaps nothing. Requests are never refused for this: it's a heads-up before sending.
 */
export function conflictsWith<T extends ConflictRow>(mine: SpanInput, day: readonly T[], ownId: string | null = null): T[] {
  const a = spanOf(mine);
  if (a === null) return [];
  return day.filter((row) => {
    if (row.id !== null && row.id === ownId) return false;
    if (row.status_key === 'postponed' || row.status === 'returned' || row.status === 'withdrawn') return false;
    const b = spanOf(row);
    return b !== null && a.start < b.end && b.start < a.end;
  });
}

/** A calendar day as a date input gives it (empty while being typed). */
export function isDay(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export function addDaysTo(day: string, n: number): string {
  return format(addDays(parseISO(day), n), 'yyyy-MM-dd');
}

/** Monday to Sunday around a day. */
export function weekOf(day: string): { from: string; to: string } {
  const from = format(startOfWeek(parseISO(day), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  return { from, to: addDaysTo(from, 6) };
}

export function monthOf(day: string): { from: string; to: string } {
  const d = parseISO(day);
  return { from: format(startOfMonth(d), 'yyyy-MM-dd'), to: format(endOfMonth(d), 'yyyy-MM-dd') };
}

export function daysFrom(from: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDaysTo(from, i));
}

/** The day, time and length fields as picked (select values). */
export interface WhenPick {
  date: string;
  time: string;
  duration: string;
}

export function whenOf(p: WhenPick): { date: string; startTime: string | null; durationKind: DurationKind; durationMin: number | null } {
  const d = durationOf(p.duration);
  return { date: p.date, startTime: p.time === FLEXIBLE ? null : p.time, durationKind: d.kind, durationMin: d.min };
}

/** The date a new request starts with: the day I'm looking at, unless it's already past. */
export function requestDay(selected: string, today: string): string {
  return selected >= today ? selected : today;
}
