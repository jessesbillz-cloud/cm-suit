// What the calendar draws (MDR's schedule calendar): each job's inspection requests and blocked time
// (calendar_inspections) and every other line (calendar_entries), merged into job-local days. A job's mirrored
// inspection lines give way to its requests, so nothing shows twice. Pure; tested in entries.test.ts.
//
// MDR's palette, one mapping: a request's state -> lib/status key is inspections/model rowChip (it mirrors the
// database's ir_status_key): green confirmed / approved, yellow pending, orange postponed (with a pause mark), red not
// approved, returned or blocked, gray waiting on the GC; one with a helper stays green (0075). The colors themselves are lib/status.
import type { CalendarInspection, CalendarLine } from '../../data/calendar.types';
import { formatInZone } from '../../lib/dates';
import type { StatusKey } from '../../lib/status';
import { rowChip } from '../inspections/model';
import { lineChip, lineDay } from './model';

export type Entry =
  | { type: 'ir'; key: string; day: string; time: string; projectId: string; projectName: string; row: CalendarInspection }
  | { type: 'line'; key: string; day: string; time: string; projectId: string; projectName: string; line: CalendarLine };

export type IrEntry = Extract<Entry, { type: 'ir' }>;
export type LineEntry = Extract<Entry, { type: 'line' }>;

interface Job {
  project_id: string;
  name: string;
}

/** The type toggle an inspection line answers to (lib/layout CALENDAR_TYPES). Blocked time goes with inspections. */
export function irKind(row: Pick<CalendarInspection, 'kind'>): 'inspections' | 'special_inspections' {
  return row.kind === 'special' ? 'special_inspections' : 'inspections';
}

/** The short type a banner shows: IOR, OFS, the special kind's name, or Blocked. */
export function shortType(row: Pick<CalendarInspection, 'kind' | 'special_kind' | 'is_block'>): string {
  if (row.is_block) return 'Blocked';
  if (row.kind === 'ior') return 'IOR';
  if (row.kind === 'ofs') return 'OFS';
  return row.special_kind ?? 'Special';
}

/** "HH:mm" to sort by; all day and Flexible sort first (''). */
function irTime(row: CalendarInspection): string {
  return row.duration_kind === 'all_day' || row.start_time === null ? '' : row.start_time.slice(0, 5);
}

function lineTimeKey(line: CalendarLine): string {
  return line.all_day ? '' : formatInZone(line.starts_at, line.timezone, 'HH:mm');
}

interface Sources {
  /** The lines the person shows (model visibleLines: their types, jobs with the calendar on). */
  lines: readonly CalendarLine[];
  inspections: readonly CalendarInspection[];
  /** Jobs whose inspections loaded: their mirrored inspection lines are dropped. */
  loaded: ReadonlySet<string>;
  types: readonly string[];
  jobs: readonly Job[];
}

export function buildEntries({ lines, inspections, loaded, types, jobs }: Sources): Entry[] {
  const name = (id: string) => jobs.find((j) => j.project_id === id)?.name ?? '';
  const out: Entry[] = [];
  for (const row of inspections) {
    if (!types.includes(irKind(row))) continue;
    const key = row.is_block ? `block:${row.project_id}:${row.id ?? ''}:${row.request_date}:${row.start_time ?? ''}` : `ir:${row.project_id}:${row.id ?? `${row.request_date}:${row.start_time ?? ''}:${row.kind}`}`;
    out.push({ type: 'ir', key, day: row.request_date, time: irTime(row), projectId: row.project_id, projectName: name(row.project_id), row });
  }
  for (const line of lines) {
    if (line.source_type === 'inspection_request' && loaded.has(line.project_id)) continue;
    out.push({ type: 'line', key: `line:${line.id}`, day: lineDay(line), time: lineTimeKey(line), projectId: line.project_id, projectName: line.project_name, line });
  }
  return out;
}

function label(e: Entry): string {
  return e.type === 'ir' ? shortType(e.row) : e.line.title;
}

/** Within a day: all day first, then by time; requests before other lines at the same time; then by label. */
function byTime(a: Entry, b: Entry): number {
  return a.time.localeCompare(b.time) || (a.type === b.type ? 0 : a.type === 'ir' ? -1 : 1) || label(a).localeCompare(label(b));
}

/** Each of these days' entries, in order. Entries on other days are left out. */
export function entriesByDay(entries: readonly Entry[], days: readonly string[]): Map<string, Entry[]> {
  const out = new Map<string, Entry[]>(days.map((d) => [d, []]));
  for (const e of entries) out.get(e.day)?.push(e);
  for (const list of out.values()) list.sort(byTime);
  return out;
}

/** The look-ahead lives in its own section under the day, not in the grid. */
export function isLookahead(e: Entry): boolean {
  return e.type === 'line' && e.line.kind === 'lookahead';
}

export interface Banner {
  label: string;
  /** null: a line with no state (a meeting, a milestone) is a quiet neutral banner. */
  tone: StatusKey | null;
  /** Postponed wears MDR's pause mark. */
  paused: boolean;
  /** The line's kind (its icon); null for inspections. */
  kind: string | null;
}

export function bannerOf(e: Entry): Banner {
  if (e.type === 'ir') {
    const tone = rowChip(e.row).status;
    return { label: shortType(e.row), tone, paused: tone === 'postponed', kind: null };
  }
  return { label: e.line.title, tone: lineChip(e.line)?.status ?? null, paused: false, kind: e.line.kind };
}

type RequestGroup = 'pending' | 'postponed' | 'confirmed' | 'done' | 'blocked';

export const GROUP_LABELS: Record<RequestGroup, string> = {
  pending: 'Pending',
  postponed: 'Postponed',
  confirmed: 'Confirmed',
  done: 'Done',
  blocked: 'Blocked',
};

const GROUP_ORDER: readonly RequestGroup[] = ['pending', 'postponed', 'confirmed', 'done', 'blocked'];

/** Waiting (on the inspector or the GC), postponed, confirmed, done (a result), or blocked time. */
export function groupOf(row: Pick<CalendarInspection, 'is_block' | 'status' | 'result'>): RequestGroup {
  if (row.is_block) return 'blocked';
  if (row.status === 'postponed') return 'postponed';
  if (row.result !== null || row.status === 'complete') return 'done';
  if (row.status === 'confirmed') return 'confirmed';
  return 'pending';
}

/** A day's requests by state, in MDR's order (what needs someone first, done last), empty groups left out. */
export function groupRequests(entries: readonly IrEntry[]): { group: RequestGroup; entries: IrEntry[] }[] {
  return GROUP_ORDER.map((group) => ({ group, entries: entries.filter((e) => groupOf(e.row) === group) })).filter(
    (g) => g.entries.length > 0,
  );
}

/** "3 inspections · 1 pending" for a day, or null when it has none. */
export function dayCount(entries: readonly Entry[]): string | null {
  const requests = entries.filter((e): e is IrEntry => e.type === 'ir' && !e.row.is_block);
  if (requests.length === 0) return null;
  const pending = requests.filter((e) => groupOf(e.row) === 'pending').length;
  const count = requests.length === 1 ? '1 inspection' : `${String(requests.length)} inspections`;
  return pending > 0 ? `${count} · ${String(pending)} pending` : count;
}
