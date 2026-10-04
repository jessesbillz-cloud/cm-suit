// The one row shape every schedule import lands as (migration 0062 schedule_activities), and the one clean-up before
// a draft is saved: trimmed text cut to the table's limits, real calendar days only, a finish before its start cleared
// (and the row marked to check), one row per Activity ID (the first kept), at most MAX_ROWS rows. Pure: no I/O.

export type SourceKind = 'pdf' | 'photo' | 'xer' | 'msp_xml' | 'csv';

export interface ScheduleRow {
  /** The scheduler's Activity ID (P6 task_code, MS Project UID), if the source has one. */
  code: string | null;
  name: string;
  wbs: string | null;
  area: string | null;
  trade: string | null;
  /** Calendar days, YYYY-MM-DD. */
  start: string | null;
  finish: string | null;
  actual_start: string | null;
  actual_finish: string | null;
  percent: number | null;
  is_milestone: boolean;
  csi_division: string | null;
  /** An AI read that isn't sure of the dates: the person checks the row. */
  unsure: boolean;
  /** Where it came from in the source ("row 12", "p3"). */
  source_ref: string | null;
}

export interface ParsedSchedule {
  title: string | null;
  /** The scheduler's data date, when the file says. Never guessed. */
  dataDate: string | null;
  rows: ScheduleRow[];
  warnings: string[];
}

export const MAX_ROWS = 5000;
const MAX_WARNINGS = 20;

/** A blank row with only a name (the parsers fill in the rest). */
export function emptyRow(name: string): ScheduleRow {
  return {
    code: null, name, wbs: null, area: null, trade: null, start: null, finish: null, actual_start: null, actual_finish: null,
    percent: null, is_milestone: false, csi_division: null, unsure: false, source_ref: null,
  };
}

/** Trimmed, inner whitespace collapsed, cut to `max` characters; blank is null. */
export function clean(v: unknown, max: number): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s === '' ? null : s.slice(0, max).trim();
}

/** A real calendar day between 1990 and 2100 as YYYY-MM-DD, else null. */
export function isoDay(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** "Oct", "Sept", "October" -> 10; anything else 0 (not a month: isoDay refuses it). */
function monthOf(name: string): number {
  const n = name.toLowerCase();
  return MONTHS[n.slice(0, 4)] ?? MONTHS[n.slice(0, 3)] ?? 0;
}

function fullYear(y: string): number {
  const n = Number(y);
  return y.length <= 2 ? (n < 70 ? 2000 + n : 1900 + n) : n;
}

export interface LooseDay {
  day: string | null;
  /** P6 prints an actual date with an "A" after it. */
  actual: boolean;
}

/**
 * A date as schedules print it: 2026-10-05 (and with a time, as XER and MSPDI write it), 10/5/2026 or 10/5/26 (US
 * month first, as MS Project prints it, optionally after a weekday: "Mon 10/5/26"), 05-Oct-26 (P6), Oct 5, 2026 and
 * 5 Oct 2026. P6's suffixes come off: "A" (actual, reported) and "*" (constrained).
 */
export function looseDay(raw: unknown): LooseDay {
  if (typeof raw !== 'string' && typeof raw !== 'number') return { day: null, actual: false };
  let s = String(raw).trim();
  let actual = false;
  const suffix = /\s*(A\*?|\*A?|\*)$/.exec(s);
  if (suffix && /\d/.test(s.slice(0, suffix.index))) {
    actual = suffix[1]?.includes('A') ?? false;
    s = s.slice(0, suffix.index).trim();
  }
  s = s.replace(/^(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\.?,?\s+/i, '');
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(s);
  if (m) return { day: isoDay(Number(m[1]), Number(m[2]), Number(m[3])), actual };
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (m) return { day: isoDay(fullYear(m[3] ?? ''), Number(m[1]), Number(m[2])), actual };
  m = /^(\d{1,2})[- ]([a-z]{3,9})\.?[- ,]+(\d{2}|\d{4})$/i.exec(s);
  if (m) return { day: isoDay(fullYear(m[3] ?? ''), monthOf(m[2] ?? ''), Number(m[1])), actual };
  m = /^([a-z]{3,9})\.? (\d{1,2}),? (\d{4})$/i.exec(s);
  if (m) return { day: isoDay(Number(m[3]), monthOf(m[1] ?? ''), Number(m[2])), actual };
  return { day: null, actual: false };
}

/** A percent 0..100 with two decimals, from a number or "40%", else null. */
export function percentOf(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace('%', '').trim()) : NaN;
  if (!Number.isFinite(n) || (typeof v === 'string' && v.trim() === '')) return null;
  return Math.round(Math.min(100, Math.max(0, n)) * 100) / 100;
}

function day(v: string | null): string | null {
  return v === null ? null : looseDay(v).day;
}

function plural(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

/** The clean-up every import goes through before its draft is saved. */
export function finishRows(input: readonly ScheduleRow[], warnings: readonly string[] = []): { rows: ScheduleRow[]; warnings: string[] } {
  const out: ScheduleRow[] = [];
  const seen = new Set<string>();
  let unnamed = 0;
  let repeated = 0;
  let backwards = 0;
  for (const r of input) {
    const name = clean(r.name, 300);
    if (name === null) {
      unnamed += 1;
      continue;
    }
    const code = clean(r.code, 60);
    if (code !== null) {
      const key = code.toLowerCase();
      if (seen.has(key)) {
        repeated += 1;
        continue;
      }
      seen.add(key);
    }
    const start = day(r.start);
    let finish = day(r.finish);
    let unsure = r.unsure;
    if (start !== null && finish !== null && finish < start) {
      finish = null;
      unsure = true;
      backwards += 1;
    }
    const actualStart = day(r.actual_start);
    let actualFinish = day(r.actual_finish);
    if (actualStart !== null && actualFinish !== null && actualFinish < actualStart) actualFinish = null;
    out.push({
      code, name, wbs: clean(r.wbs, 300), area: clean(r.area, 120), trade: clean(r.trade, 120), start, finish,
      actual_start: actualStart, actual_finish: actualFinish, percent: r.percent === null ? null : percentOf(r.percent),
      is_milestone: r.is_milestone, csi_division: clean(r.csi_division, 20), unsure, source_ref: clean(r.source_ref, 60),
    });
  }
  const notes = [...warnings];
  if (unnamed > 0) notes.push(`${plural(unnamed, 'row', 'rows')} without a name left out.`);
  if (repeated > 0) notes.push(`${plural(repeated, 'repeated Activity ID', 'repeated Activity IDs')} left out (the first kept).`);
  if (backwards > 0) notes.push(`${plural(backwards, 'finish', 'finishes')} before the start cleared.`);
  if (out.length > MAX_ROWS) notes.push(`Only the first ${String(MAX_ROWS)} activities kept.`);
  return {
    rows: out.slice(0, MAX_ROWS),
    warnings: notes.map((w) => w.replace(/\s+/g, ' ').trim().slice(0, 300)).filter((w) => w !== '').slice(0, MAX_WARNINGS),
  };
}
