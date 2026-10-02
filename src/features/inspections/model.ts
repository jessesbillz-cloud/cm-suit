// Inspection screen helpers: views, chips (colors from lib/status only), labels, the request tracker and log titles.
// Pure functions, unit-tested in model.test.ts.
import { STATUS, type StatusKey } from '../../lib/status';

export type IrView = 'day' | 'week' | 'log' | 'review';

export const VIEW_LABELS: Record<IrView, string> = { day: 'Day', week: 'Week', log: 'Log', review: 'GC review' };

/** Inspectors start on their day; everyone else on the week. The GC review list exists only with the GC step on. */
export function viewsFor(p: { decide: boolean; review: boolean }): IrView[] {
  return [...(p.decide ? (['day'] as const) : []), 'week', 'log', ...(p.review ? (['review'] as const) : [])];
}

export function parseView(v: string | undefined, allowed: readonly IrView[]): IrView {
  const hit = allowed.find((x) => x === v);
  return hit ?? allowed[0] ?? 'week';
}

/** Right-column items that are forms, not requests (requests are uuids); SHARE_ITEM is the request link and QR sheet. */
export { BLOCK_ITEM, NEW_ITEM, SHARE_ITEM } from '../../lib/itemIds';

/** The IR PDF's filename (lib/buildFilename pattern). */
export const IR_FILENAME = 'IR {#} {Project} {MM-DD-YYYY}.pdf';

interface Chip {
  status: StatusKey;
  label: string;
}

interface ChipInput {
  status: string;
  result: string | null;
  helper_id: string | null;
}

/** Mirrors ir_status_key in the database, with the words for each state. */
export function requestChip(r: ChipInput): Chip {
  if (r.status === 'gc_review') return { status: 'gc_review', label: 'GC review' };
  if (r.status === 'returned') return { status: 'blocked', label: 'Returned' };
  if (r.status === 'withdrawn') return { status: 'cancelled', label: 'Withdrawn' };
  if (r.status === 'postponed') return { status: 'postponed', label: 'Postponed' };
  if (r.result === 'approved') return { status: 'approved', label: 'Approved' };
  if (r.result === 'not_approved') return { status: 'not_approved', label: 'Not approved' };
  if (r.status === 'confirmed' && r.helper_id !== null) return { status: 'assigned', label: 'Helper' };
  if (r.status === 'confirmed' || r.status === 'complete') return { status: 'confirmed', label: 'Confirmed' };
  return { status: 'pending', label: 'Pending' };
}

function isStatusKey(k: string): k is StatusKey {
  return k in STATUS;
}

/** A calendar line: blocked time, my own / the team's (full) rows, or someone else's (only its color). */
export function rowChip(row: ChipInput & { is_block: boolean; full_detail: boolean; status_key: string }): Chip {
  if (row.is_block) return { status: 'blocked', label: 'Blocked' };
  if (row.full_detail) return requestChip(row);
  const key = isStatusKey(row.status_key) ? row.status_key : 'pending';
  return { status: key, label: STATUS[key].label };
}

export function typeLabel(kind: string, special: string | null): string {
  if (kind === 'ior') return 'IOR';
  if (kind === 'ofs') return 'OFS';
  if (kind === 'block') return 'Blocked';
  return special ? `Special: ${special}` : 'Special';
}

export const POSTPONE_REASONS = [
  { value: 'not_ready', label: 'Not ready' },
  { value: 'weather', label: 'Weather' },
  { value: 'gc_requested', label: 'GC requested' },
  { value: 'other', label: 'Other' },
] as const;

export function postponeLabel(reason: string | null): string {
  return POSTPONE_REASONS.find((r) => r.value === reason)?.label ?? '';
}

export const ATTENDANCE = [
  { value: 'be_present', label: 'Be present' },
  { value: 'alone', label: "I've got this" },
] as const;

export function attendanceLabel(v: string | null): string | null {
  return ATTENDANCE.find((a) => a.value === v)?.label ?? null;
}

export function resultLabel(v: string | null): string | null {
  if (v === 'approved') return 'Approved';
  if (v === 'not_approved') return 'Not approved';
  return null;
}

export type StepState = 'done' | 'current' | 'todo' | 'failed';

export interface TrackStep {
  key: 'submitted' | 'gc' | 'inspector' | 'result';
  label: string;
  state: StepState;
}

interface TrackInput {
  status: string;
  result: string | null;
  gc_at: string | null;
}

/** Submitted → (GC) → Inspector → Result. The GC step shows only when the job has it on or this request went through it. */
export function trackerSteps(r: TrackInput, gcStep: boolean): TrackStep[] {
  const steps: TrackStep[] = [{ key: 'submitted', label: 'Submitted', state: 'done' }];
  const atGc = r.status === 'gc_review' || r.status === 'returned';
  if (gcStep || atGc || r.gc_at !== null) {
    steps.push({
      key: 'gc',
      label: r.status === 'returned' ? 'Returned' : 'GC',
      state: r.status === 'returned' ? 'failed' : r.status === 'gc_review' ? 'current' : 'done',
    });
  }
  const inspector: TrackStep =
    atGc || r.status === 'withdrawn'
      ? { key: 'inspector', label: 'Inspector', state: 'todo' }
      : r.status === 'pending'
        ? { key: 'inspector', label: 'Inspector', state: 'current' }
        : r.status === 'postponed'
          ? { key: 'inspector', label: 'Postponed', state: 'failed' }
          : { key: 'inspector', label: 'Confirmed', state: 'done' };
  steps.push(inspector);
  const result = resultLabel(r.result);
  steps.push({
    key: 'result',
    label: result ?? 'Result',
    state: r.result === 'approved' ? 'done' : r.result === 'not_approved' ? 'failed' : inspector.state === 'done' ? 'current' : 'todo',
  });
  return steps;
}

/** An inspector step card: done, the one to do now, open (can be done any time), or not reached yet. */
export type CardState = 'done' | 'current' | 'open' | 'todo';

interface StepsInput {
  status: string;
  result: string | null;
  attendance: string | null;
  ir_file_id: string | null;
  pdf_stale: boolean;
  results_sent_at: string | null;
}

/** Where the inspector is on one request: Confirm → Attendance → Result → IR → Send results. */
export function inspectorSteps(r: StepsInput): Record<'confirm' | 'attendance' | 'result' | 'pdf' | 'send', CardState> {
  const waiting = r.status === 'pending' || r.status === 'postponed';
  const hasPdf = r.ir_file_id !== null && !r.pdf_stale;
  return {
    confirm: waiting ? 'current' : 'done',
    attendance: r.attendance !== null ? 'done' : 'open',
    result: r.status === 'postponed' ? 'todo' : r.result !== null ? 'done' : r.status === 'pending' ? 'open' : 'current',
    pdf: r.result === null || (r.status === 'postponed' && r.ir_file_id === null) ? 'todo' : hasPdf ? 'done' : 'current',
    send: r.status !== 'complete' || !hasPdf ? 'todo' : r.results_sent_at !== null ? 'done' : 'current',
  };
}

type MetaRow = ChipInput & { is_block: boolean; full_detail: boolean; status_key: string };

/** The page header's line for today: "Today · 3 requests · 1 pending". */
export function dayMeta(rows: readonly MetaRow[]): string {
  const requests = rows.filter((r) => !r.is_block);
  if (requests.length === 0) return 'Nothing today';
  const pending = requests.filter((r) => rowChip(r).status === 'pending').length;
  const count = requests.length === 1 ? '1 request' : `${String(requests.length)} requests`;
  return pending > 0 ? `Today · ${count} · ${String(pending)} pending` : `Today · ${count}`;
}

const ACTIONS: Record<string, string> = {
  submit: 'Requested',
  confirm: 'Confirmed',
  unconfirm: 'Back to pending',
  move: 'Moved',
  withdraw: 'Withdrawn',
  restore: 'Requested again',
  gc_approve: 'GC approved',
  gc_return: 'GC returned',
  attendance: 'Attendance',
  result: 'Result',
  postpone: 'Postponed',
  helper: 'Helper',
  claim: 'Taken over',
  helper_claim: 'Helper joined',
  helper_report: 'Helper report',
  sign: 'Signed',
  pdf: 'IR made',
  pdf_update: 'PDF updated',
  pdf_stamp: 'PDF stamped',
  pdf_delete: 'PDF deleted',
  send: 'Results sent',
};

export function actionLabel(action: string): string {
  return ACTIONS[action] ?? 'Changed';
}

export function firstLine(text: string): string {
  return text.split('\n').find((l) => l.trim() !== '')?.trim() ?? '';
}

interface LogInput {
  kind: string;
  company: string;
  items: string;
  status: string;
  result: string | null;
  ir_special_kinds: { name: string } | null;
}

/** A log row's full title: type, company, what, and how it ended. */
export function logTitle(r: LogInput): string {
  const end = resultLabel(r.result) ?? (r.status === 'postponed' ? 'Postponed' : null);
  const base = `${typeLabel(r.kind, r.ir_special_kinds?.name ?? null)} · ${r.company} · ${firstLine(r.items)}`;
  return end ? `${base} (${end})` : base;
}

/** Requests in a period, counting each postponement as an extra request. */
export function requestCount(rows: readonly { postpone_count: number }[]): { requests: number; postponed: number } {
  const postponed = rows.reduce((n, r) => n + r.postpone_count, 0);
  return { requests: rows.length + postponed, postponed };
}
