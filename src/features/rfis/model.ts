// RFI screen helpers (the Sep 28 contract, SPEC §7.4): labels, chips (colors from lib/status only), the words for who
// has it, how long, due and late, the log's filters, order and search, and the impact window. Pure, unit-tested.
import type { RfiEventKind, RfiListRow, RfiStatus, RfiWaitingRow } from '../../data/rfis.types';
import { formatInZone, todayInZone } from '../../lib/dates';
import type { StatusKey } from '../../lib/status';

/** The right-column item that is not a row (rows are uuids). */
export const NEW_ITEM = 'new';

const DAY = 86_400_000;

function pad(n: number): string {
  return String(n).padStart(3, '0');
}

/** "RFI 004"; an RFI gets its number only when it is issued. */
export function rfiLabel(n: number | null): string {
  return n === null ? 'Draft' : `RFI ${pad(n)}`;
}

/** The log's number cell: "004", or "Draft". */
export function rfiNumber(n: number | null): string {
  return n === null ? 'Draft' : pad(n);
}

interface Chip {
  status: StatusKey;
  label: string;
}

const CHIPS: Record<RfiStatus, Chip> = {
  draft: { status: 'cancelled', label: 'Draft' },
  review: { status: 'pending', label: 'In review' },
  issue: { status: 'pending', label: 'To issue' },
  open: { status: 'assigned', label: 'Open' },
  answered: { status: 'confirmed', label: 'Answered' },
  closed: { status: 'cancelled', label: 'Closed' },
  void: { status: 'cancelled', label: 'Void' },
};

export function statusChip(status: RfiStatus): Chip {
  return CHIPS[status];
}

// --- Time words -----------------------------------------------------------------------------------------------------

/** Whole days from a moment to now (0 = less than a day). */
export function daysSince(since: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(since)) / DAY));
}

/** How long someone has had it: "Since today", "1 day", "5 days". */
export function daysText(n: number): string {
  if (n === 0) return 'Since today';
  return n === 1 ? '1 day' : `${String(n)} days`;
}

/** Calendar days from one yyyy-MM-dd to another. */
function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
}

export interface Due {
  text: string;
  late: boolean;
}

/** The answer due date on the job's calendar: "Due Oct 3", "Due today", "3 days late" (late = red). */
export function dueText(dueAt: string, tz: string, now: Date): Due {
  const days = dayDiff(formatInZone(dueAt, tz, 'yyyy-MM-dd'), todayInZone(tz, now));
  if (days > 0) return { text: days === 1 ? '1 day late' : `${String(days)} days late`, late: true };
  if (days === 0) return { text: 'Due today', late: Date.parse(dueAt) < now.getTime() };
  return { text: `Due ${formatInZone(dueAt, tz, 'MMM d')}`, late: false };
}

/** The log's Due column: "Oct 3", "Today" or "2 days late" while the architect has it; the plain date afterwards. */
export function dueCell(row: Pick<RfiListRow, 'status' | 'due_at'>, tz: string, now: Date): Due | null {
  if (row.due_at === null) return null;
  const day = formatInZone(row.due_at, tz, 'MMM d');
  if (row.status !== 'open') return { text: day, late: false };
  const due = dueText(row.due_at, tz, now);
  if (due.text === 'Due today') return { text: 'Today', late: due.late };
  return due.late ? due : { text: day, late: false };
}

/** The phone's second line: the due words while the architect has it. */
export function dueLine(row: Pick<RfiListRow, 'status' | 'due_at'>, tz: string, now: Date): Due | null {
  return row.status === 'open' && row.due_at !== null ? dueText(row.due_at, tz, now) : null;
}

const WITH_SOMEONE: readonly RfiStatus[] = ['review', 'issue', 'open'];

/** The holder has not opened it since it reached them. */
export function notOpened(row: Pick<RfiListRow, 'status' | 'held_opened_at'>): boolean {
  return WITH_SOMEONE.includes(row.status) && row.held_opened_at === null;
}

/** Why it sits at the top of "Needs you": "2 days late", "Due today", "Not opened · 5 days". */
export function waitingText(w: Pick<RfiWaitingRow, 'reason' | 'due_at' | 'held_since'>, tz: string, now: Date): string {
  if (w.reason === 'late' && w.due_at !== null) return dueText(w.due_at, tz, now).text;
  return `Not opened · ${daysText(w.held_since === null ? 0 : daysSince(w.held_since, now))}`;
}

/** The originator's window to claim cost or time impact after the answer. */
export function impactWindow(impactUntil: string | null, tz: string, now: Date): { open: boolean; text: string } | null {
  if (impactUntil === null) return null;
  if (Date.parse(impactUntil) < now.getTime()) return { open: false, text: 'Window closed' };
  const left = dayDiff(todayInZone(tz, now), formatInZone(impactUntil, tz, 'yyyy-MM-dd'));
  if (left <= 0) return { open: true, text: 'Last day' };
  return { open: true, text: left === 1 ? '1 day left' : `${String(left)} days left` };
}

/** "Cost and time", "Cost", "Time". */
export function impactKinds(cost: boolean | null, time: boolean | null): string {
  if (cost === true && time === true) return 'Cost and time';
  if (cost === true) return 'Cost';
  return time === true ? 'Time' : '';
}

export const EVENT_LABELS: Record<RfiEventKind, string> = {
  created: 'Drafted',
  edited: 'Edited',
  sent: 'Signed & sent',
  forwarded: 'Sent on',
  returned: 'Sent back',
  issued: 'Signed & issued',
  opened: 'Opened',
  answered: 'Answered',
  impact_claimed: 'Impact claimed',
  impact_note: 'GC note',
  closed: 'Closed',
  voided: 'Voided',
};

// --- The log: filter, order, search ---------------------------------------------------------------------------------

export const FILTERS = [
  { value: 'open', label: 'Open' },
  { value: 'mine', label: 'Mine' },
  { value: 'all', label: 'All' },
] as const;
export type Filter = (typeof FILTERS)[number]['value'];

export function parseFilter(v: string | undefined): Filter {
  return FILTERS.find((f) => f.value === v)?.value ?? 'open';
}

const DONE: readonly RfiStatus[] = ['closed', 'void'];

export function filterRows(rows: readonly RfiListRow[], filter: Filter, userId: string): RfiListRow[] {
  if (filter === 'open') return rows.filter((r) => !DONE.includes(r.status));
  if (filter === 'mine') return rows.filter((r) => r.created_by === userId || r.is_mine_to_act);
  return [...rows];
}

const SORT_KEYS = ['number', 'title', 'status', 'asked', 'due', 'answered'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
/** null = the default order. */
export type Sort = { key: SortKey; dir: 'asc' | 'desc' } | null;

export function parseSort(v: string | undefined): Sort {
  const [key, dir] = (v ?? '').split('.');
  const k = SORT_KEYS.find((x) => x === key);
  return k && (dir === 'asc' || dir === 'desc') ? { key: k, dir } : null;
}

export function sortParam(s: Sort): string | undefined {
  return s === null ? undefined : `${s.key}.${s.dir}`;
}

/** A header click: a new column starts ascending, then descending, then back to the default order. */
export function nextSort(current: Sort, key: SortKey): Sort {
  if (current?.key !== key) return { key, dir: 'asc' };
  return current.dir === 'asc' ? { key, dir: 'desc' } : null;
}

function isLate(r: RfiListRow, now: Date): boolean {
  return r.status === 'open' && r.due_at !== null && Date.parse(r.due_at) < now.getTime();
}

/** 0 mine to act, 1 late, 2 has a due date, 3 the rest. */
function rank(r: RfiListRow, now: Date): number {
  if (r.is_mine_to_act) return 0;
  if (isLate(r, now)) return 1;
  return r.due_at !== null && r.status === 'open' ? 2 : 3;
}

function time(v: string | null): number | null {
  return v === null ? null : Date.parse(v);
}

/** Mine to act first, then late, then anything due (soonest first), then newest. */
export function defaultOrder(rows: readonly RfiListRow[], now: Date): RfiListRow[] {
  return [...rows].sort((a, b) => {
    const byRank = rank(a, now) - rank(b, now);
    if (byRank !== 0) return byRank;
    const ad = a.status === 'open' ? time(a.due_at) : null;
    const bd = b.status === 'open' ? time(b.due_at) : null;
    if (ad !== bd) {
      if (ad === null) return 1;
      if (bd === null) return -1;
      return ad - bd;
    }
    return Date.parse(b.created_at) - Date.parse(a.created_at);
  });
}

const COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const STATUS_ORDER: readonly RfiStatus[] = ['draft', 'review', 'issue', 'open', 'answered', 'closed', 'void'];

function sortValue(r: RfiListRow, key: SortKey): string | number | null {
  switch (key) {
    case 'number':
      return r.number;
    case 'title':
      return r.title;
    case 'status':
      return STATUS_ORDER.indexOf(r.status);
    case 'asked':
      return time(r.sent_at);
    case 'due':
      return time(r.due_at);
    case 'answered':
      return time(r.answered_at);
  }
}

/** Stable; empty values sort last either way; text compares naturally and without case. */
function sortBy(rows: readonly RfiListRow[], sort: NonNullable<Sort>): RfiListRow[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = sortValue(a, sort.key);
    const bv = sortValue(b, sort.key);
    if (av === bv) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return sign * (typeof av === 'number' && typeof bv === 'number' ? av - bv : COLLATOR.compare(String(av), String(bv)));
  });
}

/** A number typed as "RFI 4", "rfi-004", "4" or "#4". */
function numberQuery(query: string): number | null {
  const m = /^(?:rfi[-\s#]*|#)?0*(\d{1,6})$/i.exec(query.trim());
  return m?.[1] ? Number(m[1]) : null;
}

export function matches(row: RfiListRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  if (row.number !== null && numberQuery(q) === row.number) return true;
  return [rfiLabel(row.number), row.title, row.originator_name].some((v) => v.toLowerCase().includes(q));
}

export interface LogView {
  filter: Filter;
  query: string;
  sort: Sort;
  userId: string;
}

export function visibleRows(rows: readonly RfiListRow[], view: LogView, now: Date): RfiListRow[] {
  const shown = filterRows(rows, view.filter, view.userId).filter((r) => matches(r, view.query));
  return view.sort === null ? defaultOrder(shown, now) : sortBy(shown, view.sort);
}

/** Enter in the search box: that number (in any filter), else the only match. */
export function openTarget(rows: readonly RfiListRow[], visible: readonly RfiListRow[], query: string): RfiListRow | undefined {
  const n = numberQuery(query);
  return rows.find((r) => n !== null && r.number === n) ?? (visible.length === 1 ? visible[0] : undefined);
}

// --- Job settings -----------------------------------------------------------------------------------------------------

/** Moves one route step up (-1) or down (+1); a move past either end changes nothing. */
export function moveAt<T>(list: readonly T[], index: number, step: -1 | 1): T[] {
  const to = index + step;
  const item = list[index];
  if (item === undefined || to < 0 || to >= list.length) return [...list];
  const next = list.filter((_, i) => i !== index);
  next.splice(to, 0, item);
  return next;
}

/** Answer due and the impact window are whole days, 1 to 60 (the database's check). */
export function parseDays(text: string): number | null {
  const n = Number(text.trim());
  return Number.isInteger(n) && n >= 1 && n <= 60 ? n : null;
}

/** The items before and after this one in the order shown (arrow keys). */
export function neighbors(visible: readonly RfiListRow[], id: string): { prev: string | null; next: string | null } {
  const i = visible.findIndex((r) => r.id === id);
  if (i < 0) return { prev: null, next: null };
  return { prev: visible[i - 1]?.id ?? null, next: visible[i + 1]?.id ?? null };
}
