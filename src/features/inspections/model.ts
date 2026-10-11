// Inspection screen helpers: views, the route (who decides a request now), chips (colors from lib/status only), labels,
// the request tracker and log titles. Pure functions, unit-tested in model.test.ts.
import { STATUS, type StatusKey } from '../../lib/status';

export type IrView = 'day' | 'month' | 'log' | 'review';

export const VIEW_LABELS: Record<IrView, string> = { day: 'Day', month: 'Month', log: 'Log', review: 'GC review' };

/** Whoever inspects starts on their day (the inspector; the deputy on his OFS requests); everyone else on the month
 *  (ui/MonthCalendar, Jesse Oct 10; it replaced the week). The GC review list is the GC's, on a job with the GC step on
 *  or one that takes OFS requests (always reviewed). */
export function viewsFor(p: { decide: boolean; review: boolean }): IrView[] {
  return [...(p.decide ? (['day'] as const) : []), 'month', 'log', ...(p.review ? (['review'] as const) : [])];
}

/** The view in the URL if allowed, else the first one. A link from before the month ("?view=week") opens the month. */
export function parseView(v: string | undefined, allowed: readonly IrView[]): IrView {
  const wanted = v === 'week' ? 'month' : v;
  const hit = allowed.find((x) => x === wanted);
  return hit ?? allowed[0] ?? 'month';
}

/** Right-column items that are forms, not requests (requests are uuids); SHARE_ITEM is the request link and QR sheet. */
export { BLOCK_ITEM, NEW_ITEM, SHARE_ITEM } from '../../lib/itemIds';

/** The IR PDF's filename (lib/buildFilename pattern). */
export const IR_FILENAME = 'IR {#} {Project} {MM-DD-YYYY}.pdf';

/** What the route reads of a request: its kind and whether the inspector has sent it to OFS. The table's rows carry
 *  ofs_sent_at; the calendar's lines and the link's answer carry ofs_sent. */
interface RouteInput {
  kind?: string | undefined;
  ofs_sent_at?: string | null | undefined;
  ofs_sent?: boolean | undefined;
}

/** What I hold of the two rights that decide requests. */
interface Deciders {
  decide: boolean;
  ofsDecide: boolean;
}

/** An OFS request the inspector has sent to OFS (SPEC §18.4 P1): the deputy's from there. */
export function withOfs(r: RouteInput): boolean {
  return r.kind === 'ofs' && (r.ofs_sent === true || (r.ofs_sent_at !== undefined && r.ofs_sent_at !== null));
}

/**
 * Who decides a request now: the ONE rule (ir_decide_cap in the database). An OFS request sent to OFS is the deputy's
 * (ir.ofs_decide); every other request, and an OFS one not sent yet, is the inspector's (ir.decide).
 */
export function decidesRequest(r: RouteInput, can: Deciders): boolean {
  return withOfs(r) ? can.ofsDecide : can.decide;
}

/** An OFS request still on its way: the inspector only routes it (Send to OFS, Postpone). He never inspects it. */
export function routesOnly(r: RouteInput): boolean {
  return r.kind === 'ofs' && !withOfs(r);
}

interface Chip {
  status: StatusKey;
  label: string;
}

/** A request the inspector sent on: where it is now, to everyone but the deputy. */
export const WITH_OFS = 'With OFS';

interface ChipInput extends RouteInput {
  status: string;
  result: string | null;
  helper_id: string | null;
}

/** Mirrors ir_status_key in the database, with the words for each state. A pending OFS request sent to OFS reads
 *  "With OFS" (the pending color) to everyone but the one who decides OFS requests: to the deputy it is Pending. */
export function requestChip(r: ChipInput, ofsDecide = false): Chip {
  if (r.status === 'gc_review') return { status: 'gc_review', label: 'GC review' };
  if (r.status === 'returned') return { status: 'blocked', label: 'Returned' };
  if (r.status === 'withdrawn') return { status: 'cancelled', label: 'Withdrawn' };
  if (r.status === 'postponed') return { status: 'postponed', label: 'Postponed' };
  if (r.result === 'approved') return { status: 'approved', label: 'Approved' };
  if (r.result === 'not_approved') return { status: 'not_approved', label: 'Not approved' };
  // A helper on it: still confirmed (green, as MDR; no blue), with its own word.
  if (r.status === 'confirmed' && r.helper_id !== null) return { status: 'confirmed', label: 'Helper' };
  if (r.status === 'confirmed' || r.status === 'complete') return { status: 'confirmed', label: 'Confirmed' };
  return { status: 'pending', label: withOfs(r) && !ofsDecide ? WITH_OFS : 'Pending' };
}

/** The OFS request's one extra question, and what a Yes asks for (SPEC §18.4 P1). */
export const SPECIAL_QUESTION = 'Special inspection required?';
export const SPECIAL_NOTICE = "Have the special inspector's reports on site for the fire marshal.";

/** The inspector's one statement when he files an OFS request himself (it goes straight to OFS). */
export const INSPECTOR_STATEMENT =
  'Submitting as the inspector, I state that the earlier required inspections (trade, GC, IOR and any special inspection) are complete.';

/** Who a new request waits on (the receipts). */
export function waitingOn(r: RouteInput & { status: string }): string | null {
  if (r.status === 'gc_review') return 'Waiting on the GC.';
  if (r.status !== 'pending') return null;
  return withOfs(r) ? 'Waiting on OFS.' : 'Waiting on the inspector.';
}

function isStatusKey(k: string): k is StatusKey {
  return k in STATUS;
}

/** A calendar line: blocked time, my own / the team's (full) rows, or someone else's (only its color). */
export function rowChip(row: ChipInput & { is_block: boolean; full_detail: boolean; status_key: string }, ofsDecide = false): Chip {
  if (row.is_block) return { status: 'blocked', label: 'Blocked' };
  if (row.full_detail) return requestChip(row, ofsDecide);
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
  { value: 'be_present', label: 'Be present with the IOR' },
  { value: 'alone', label: "I've got this alone" },
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
  key: 'submitted' | 'gc' | 'inspector' | 'ofs' | 'result';
  label: string;
  state: StepState;
}

interface TrackInput extends RouteInput {
  status: string;
  result: string | null;
  gc_at: string | null;
}

/** The inspector's step on an OFS request: he sends it on (or postpones it); done once it is with OFS. */
function ofsInspectorStep(r: TrackInput, waiting: boolean): TrackStep {
  if (waiting) return { key: 'inspector', label: 'Inspector', state: 'todo' };
  if (withOfs(r)) return { key: 'inspector', label: 'Inspector', state: 'done' };
  if (r.status === 'postponed') return { key: 'inspector', label: 'Postponed', state: 'failed' };
  return { key: 'inspector', label: 'Inspector', state: 'current' };
}

/** The deputy's step: nothing until the request is sent; then as the inspector's step on any other request. */
function ofsStep(r: TrackInput, waiting: boolean): TrackStep {
  if (waiting || !withOfs(r)) return { key: 'ofs', label: 'OFS', state: 'todo' };
  if (r.status === 'pending') return { key: 'ofs', label: 'OFS', state: 'current' };
  if (r.status === 'postponed') return { key: 'ofs', label: 'Postponed', state: 'failed' };
  return { key: 'ofs', label: 'Confirmed', state: 'done' };
}

/**
 * Submitted → (GC) → Inspector → Result; an OFS request: Submitted → (GC) → Inspector → OFS → Result (SPEC §18.4 P1).
 * The GC step shows only when the job has it on or this request is at, or went through, the GC.
 */
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
  const waiting = atGc || r.status === 'withdrawn';
  let last: TrackStep;
  if (r.kind === 'ofs') {
    last = ofsStep(r, waiting);
    steps.push(ofsInspectorStep(r, waiting), last);
  } else {
    last = waiting
      ? { key: 'inspector', label: 'Inspector', state: 'todo' }
      : r.status === 'pending'
        ? { key: 'inspector', label: 'Inspector', state: 'current' }
        : r.status === 'postponed'
          ? { key: 'inspector', label: 'Postponed', state: 'failed' }
          : { key: 'inspector', label: 'Confirmed', state: 'done' };
    steps.push(last);
  }
  const result = resultLabel(r.result);
  steps.push({
    key: 'result',
    label: result ?? 'Result',
    state: r.result === 'approved' ? 'done' : r.result === 'not_approved' ? 'failed' : last.state === 'done' ? 'current' : 'todo',
  });
  return steps;
}

/** Still with the GC (or withdrawn): the inspector has no steps on it yet. */
export const WITH_GC: readonly string[] = ['gc_review', 'returned', 'withdrawn'];

interface OwnerInput extends RouteInput {
  status: string;
  owner_id: string | null;
  ofs_sent_by?: string | null | undefined;
}

/**
 * The decider's own steps show on this request (InspectorPanel): past the GC, and mine or nobody's yet. On a request
 * with OFS, an owner who is also its sender is the inspector who had it before the route existed (0061 sent the OFS
 * requests he had already acted on): nobody's among the deputies, as the database reads it (ir_owner_ok).
 */
export function ownsSteps(r: OwnerInput, me: string): boolean {
  if (WITH_GC.includes(r.status)) return false;
  return r.owner_id === null || r.owner_id === me || (withOfs(r) && r.owner_id === r.ofs_sent_by);
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

/** A result is recorded on a confirmed request only: Confirm is its own step (MDR: Confirm schedule, the attendance
 *  call, then Approved / Not approved; Jesse, Oct 5). Attendance never confirms, and neither does a stray result tap. */
export function resultOpen(status: string): boolean {
  return status === 'confirmed' || status === 'complete';
}

/** Where the inspector is on one request: Confirm → Attendance → Result → IR → Send results. */
export function inspectorSteps(r: StepsInput): Record<'confirm' | 'attendance' | 'result' | 'pdf' | 'send', CardState> {
  const waiting = r.status === 'pending' || r.status === 'postponed';
  const hasPdf = r.ir_file_id !== null && !r.pdf_stale;
  return {
    confirm: waiting ? 'current' : 'done',
    attendance: r.attendance !== null ? 'done' : 'open',
    result: !resultOpen(r.status) ? 'todo' : r.result !== null ? 'done' : 'current',
    pdf: r.result === null || (r.status === 'postponed' && r.ir_file_id === null) ? 'todo' : hasPdf ? 'done' : 'current',
    send: r.status !== 'complete' || !hasPdf ? 'todo' : r.results_sent_at !== null ? 'done' : 'current',
  };
}

type MetaRow = ChipInput & { is_block: boolean; full_detail: boolean; status_key: string };

/** The page header's line for today: "Today · 3 requests · 1 pending". A request with OFS is pending only to the one
 *  who decides OFS requests: the inspector's count leaves it out. */
export function dayMeta(rows: readonly MetaRow[], ofsDecide = false): string {
  const requests = rows.filter((r) => !r.is_block);
  if (requests.length === 0) return 'Nothing today';
  const pending = requests.filter((r) => rowChip(r).status === 'pending' && (ofsDecide || !withOfs(r))).length;
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
  send_ofs: 'Sent to OFS',
  unsend_ofs: 'Send undone',
  link_join: 'Requester signed in',
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
