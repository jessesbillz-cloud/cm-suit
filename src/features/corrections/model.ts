// Corrections screen helpers (SPEC §13.4, §7.4): labels, chips (colors from lib/status only), the log's sort and
// search, the steps a person may take, prefill, and the weekly snapshot. Pure functions, unit-tested.
import {
  CORRECTION_STATUSES,
  CORRECTION_STEPS,
  STEP_CAPABILITY,
  STEP_FROM,
  type CorrectionHistoryRow,
  type CorrectionRow,
  type CorrectionStatus,
  type CorrectionStep,
  type HistoryAction,
} from '../../data/corrections.types';
import type { StatusKey } from '../../lib/status';

/** Right-column items that are not a row (rows are uuids). */
export const NEW_ITEM = 'new';
export const PROGRESS_ITEM = 'progress';

/** CN-001 ... CN-999, then CN-1000. The same rule as correction_label() in the database. */
export function cnLabel(n: number): string {
  return `CN-${String(n).padStart(3, '0')}`;
}

interface Chip {
  status: StatusKey;
  label: string;
}

const CHIPS: Record<CorrectionStatus, Chip> = {
  open: { status: 'pending', label: 'Open' },
  ready: { status: 'assigned', label: 'Ready' },
  corrected: { status: 'approved', label: 'Corrected' },
  signed_off: { status: 'confirmed', label: 'Signed off' },
  reopened: { status: 'not_approved', label: 'Reopened' },
};

export function statusChip(status: CorrectionStatus): Chip {
  return CHIPS[status];
}

/** Button and confirm labels for each step. */
export const STEP_LABELS: Record<CorrectionStep, string> = {
  ready: 'Mark ready',
  corrected: 'Corrected',
  signed_off: 'Sign off',
  reopened: 'Reopen',
};

/** What the toast says after a step. */
export function stepDone(step: CorrectionStep, n: number): string {
  const said: Record<CorrectionStep, string> = { ready: 'marked ready', corrected: 'corrected', signed_off: 'signed off', reopened: 'reopened' };
  return `${cnLabel(n)} ${said[step]}`;
}

export interface Caps {
  view: boolean;
  create: boolean;
  markReady: boolean;
  close: boolean;
}

/** The steps this person may take on an item now (the database checks again). */
export function stepsFor(status: CorrectionStatus, caps: Caps): CorrectionStep[] {
  return CORRECTION_STEPS.filter((s) => STEP_FROM[s].includes(status)).filter((s) =>
    STEP_CAPABILITY[s] === 'corrections.close' ? caps.close : caps.markReady,
  );
}

/** The creator (while they may create) or an inspector edits; the same rule as the update policy. */
export function canEdit(row: CorrectionRow, userId: string, caps: Caps): boolean {
  return (row.created_by === userId && caps.create) || caps.close;
}

// --- The log: sort and search ------------------------------------------------------------------------------------

const SORT_KEYS = ['number', 'title', 'status', 'trade', 'location', 'opened', 'closed'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export interface Sort {
  key: SortKey;
  dir: 'asc' | 'desc';
}
const DEFAULT_SORT: Sort = { key: 'number', dir: 'desc' };

export function parseSort(v: string | undefined): Sort {
  const [key, dir] = (v ?? '').split('.');
  const k = SORT_KEYS.find((x) => x === key);
  return k && (dir === 'asc' || dir === 'desc') ? { key: k, dir } : DEFAULT_SORT;
}

export function sortParam(s: Sort): string | undefined {
  return s.key === DEFAULT_SORT.key && s.dir === DEFAULT_SORT.dir ? undefined : `${s.key}.${s.dir}`;
}

/** Clicking a header: a new column starts ascending; the same column flips. */
export function nextSort(current: Sort, key: SortKey): Sort {
  return { key, dir: current.key === key && current.dir === 'asc' ? 'desc' : 'asc' };
}

const COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const STATUS_ORDER: readonly CorrectionStatus[] = ['open', 'reopened', 'ready', 'corrected', 'signed_off'];

function sortValue(r: CorrectionRow, key: SortKey): string | number | null {
  switch (key) {
    case 'number':
      return r.number;
    case 'status':
      return STATUS_ORDER.indexOf(r.status);
    case 'title':
    case 'trade':
    case 'location':
      return r[key] === '' ? null : r[key];
    case 'opened':
      return Date.parse(r.created_at);
    case 'closed':
      return r.closed_at === null ? null : Date.parse(r.closed_at);
  }
}

/** Stable; empty values sort last either way; text compares naturally and without case. */
export function sortCorrections(rows: readonly CorrectionRow[], sort: Sort): CorrectionRow[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = sortValue(a, sort.key);
    const bv = sortValue(b, sort.key);
    if (av === bv) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    const c = typeof av === 'number' && typeof bv === 'number' ? av - bv : COLLATOR.compare(String(av), String(bv));
    return sign * c;
  });
}

/** A number typed as "CN-12", "cn 012", "12" or "#12". */
function numberQuery(query: string): number | null {
  const m = /^(?:cn[-\s]?|#)?0*(\d{1,6})$/i.exec(query.trim());
  return m?.[1] ? Number(m[1]) : null;
}

/** One box over number, title, trade, location and spec tags. */
export function matches(row: CorrectionRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  if (numberQuery(q) === row.number) return true;
  return [cnLabel(row.number), row.title, row.trade, row.location, ...row.spec_tags].some((v) => v.toLowerCase().includes(q));
}

export function visibleRows(rows: readonly CorrectionRow[], query: string, sort: Sort): CorrectionRow[] {
  return sortCorrections(rows.filter((r) => matches(r, query)), sort);
}

/** Enter in the search box: the exact number, else the only match. */
export function openTarget(rows: readonly CorrectionRow[], visible: readonly CorrectionRow[], query: string): CorrectionRow | undefined {
  const n = numberQuery(query);
  return rows.find((r) => r.number === n) ?? (visible.length === 1 ? visible[0] : undefined);
}

/** The items before and after this one in the order shown (arrow keys). */
export function neighbors(visible: readonly CorrectionRow[], id: string): { prev: string | null; next: string | null } {
  const i = visible.findIndex((r) => r.id === id);
  if (i < 0) return { prev: null, next: null };
  return { prev: visible[i - 1]?.id ?? null, next: visible[i + 1]?.id ?? null };
}

// --- New item, history, progress ---------------------------------------------------------------------------------

/** Trade and location from my latest item on this job: people log several items in one place. */
export function prefill(rows: readonly CorrectionRow[], userId: string): { trade: string; location: string } {
  const mine = rows.filter((r) => r.created_by === userId).sort((a, b) => b.number - a.number)[0];
  return { trade: mine?.trade ?? '', location: mine?.location ?? '' };
}

/** Spec tags typed as one line: commas or semicolons between them. */
export function parseTags(text: string): string[] {
  return [...new Set(text.split(/[,;]/).map((t) => t.trim()).filter((t) => t !== ''))];
}

export const HISTORY_LABELS: Record<HistoryAction, string> = {
  created: 'Opened',
  edited: 'Edited',
  ready: 'Marked ready',
  corrected: 'Corrected',
  signed_off: 'Signed off',
  reopened: 'Reopened',
  undone: 'Undone',
};

/** The latest status step still in effect (not undone): what the inspector reads before deciding. */
export function latestStep(history: readonly CorrectionHistoryRow[]): CorrectionHistoryRow | undefined {
  const undone = new Set(history.flatMap((h) => (h.undoes ? [h.undoes] : [])));
  return [...history]
    .sort((a, b) => b.seq - a.seq)
    .find((h) => !undone.has(h.id) && h.action !== 'created' && h.action !== 'edited' && h.action !== 'undone');
}

const OPEN_STATUSES: readonly CorrectionStatus[] = ['open', 'ready', 'reopened'];

/** The page header's count line: "4 open · 1 ready" (open = open, ready or reopened; ready = waiting on the inspector). */
export function logSummary(rows: readonly CorrectionRow[]): string {
  const open = rows.filter((r) => OPEN_STATUSES.includes(r.status)).length;
  const ready = rows.filter((r) => r.status === 'ready').length;
  return ready > 0 ? `${String(open)} open · ${String(ready)} ready` : `${String(open)} open`;
}

interface Snapshot {
  counts: Record<CorrectionStatus, number>;
  openedThisWeek: number;
  closedThisWeek: number;
  open: CorrectionRow[];
}

/** The weekly progress snapshot. weekStart is the project's Monday 00:00 (lib/dates weekStartInZone). */
export function weeklySnapshot(rows: readonly CorrectionRow[], weekStart: string): Snapshot {
  const since = Date.parse(weekStart);
  const counts = Object.fromEntries(CORRECTION_STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length])) as Record<
    CorrectionStatus,
    number
  >;
  return {
    counts,
    openedThisWeek: rows.filter((r) => Date.parse(r.created_at) >= since).length,
    closedThisWeek: rows.filter((r) => r.closed_at !== null && Date.parse(r.closed_at) >= since).length,
    open: rows.filter((r) => OPEN_STATUSES.includes(r.status)).sort((a, b) => a.number - b.number),
  };
}
