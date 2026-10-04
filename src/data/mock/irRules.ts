// The inspection route's rules for the e2e mock, as the database has them (0024, 0055, 0061), in one place: who holds
// which inspection right, who reads a request in full (ir_may_see), who decides it now (ir_decide_cap, ir_owner_ok,
// ir_decider), where a new request starts (ir_first_status), and each step with its refusals in the database's own
// words. Pure: mock/inspections applies them to its stored requests.
import { DataError } from '../errors';
import type { IrRowRaw } from '../inspections.types';

type Row = IrRowRaw;
export type Args = Record<string, unknown>;

const ASKS: readonly string[] = ['ir.request'];
/** A mock user who is requester, GC and inspector at once ('pm' and anyone not named below), so one persona can walk
 *  a whole IOR flow. Never the OFS pair: that is the fire marshal's alone, as in the database. */
const EVERY: readonly string[] = ['ir.request', 'ir.view_all', 'ir.decide', 'ir.gc_approve'];
/** role_permissions' ir.* rows for the personas the route's tests play (0061): the fire marshal holds the OFS pair and
 *  nothing else; the inspector decides, reads and files requests; a sub, a foreman and a requester only ask. */
const CAPS: Record<string, readonly string[]> = {
  ahj: ['ir.ofs_decide', 'ir.ofs_view'],
  inspector: ['ir.request', 'ir.view_all', 'ir.decide'],
  sub: ASKS,
  foreman: ASKS,
  requester: ASKS,
  visitor: ASKS,
  bidder: [],
  anon: [],
};

/** has_capability for the ir.* rows, for any mock user (null: nobody, a visitor on the link). */
export function holds(userId: string | null, cap: string): boolean {
  if (userId === null) return false;
  return (CAPS[userId.replace(/^mock-user-/, '')] ?? EVERY).includes(cap);
}

export function forbidden(): DataError {
  return new DataError("You don't have access to that.", '42501', 'forbidden');
}

export function notFound(): DataError {
  return new DataError('That item no longer exists.', 'P0002', 'not_found');
}

/** A refusal in the database's own words (22023). */
export function refuse(message: string): DataError {
  return new DataError(message, '22023', message);
}

/** ir_status_key: the color key of a request's state. */
export function statusKey(r: Pick<Row, 'status' | 'result' | 'helper_id'>): string {
  if (r.status === 'postponed') return 'postponed';
  if (r.status === 'gc_review') return 'gc_review';
  if (r.status === 'returned') return 'blocked';
  if (r.result === 'approved' || r.result === 'not_approved') return r.result;
  if (r.status === 'confirmed' && r.helper_id !== null) return 'assigned';
  return r.status === 'confirmed' || r.status === 'complete' ? 'confirmed' : 'pending';
}

export function opt(a: Args, k: string): string | null {
  const v = a[k];
  return typeof v === 'string' ? v : null;
}

/** ir_decide_cap: an OFS request sent to OFS is the deputy's; every other request is the inspector's. */
export function decideCap(r: Pick<Row, 'kind' | 'ofs_sent_at'>): string {
  return r.kind === 'ofs' && r.ofs_sent_at !== null ? 'ir.ofs_decide' : 'ir.decide';
}

/** ir_may_see: the requester, the GC team and the inspectors; the deputy only an OFS request sent to OFS. */
export function maySee(me: string | null, r: Row): boolean {
  if (me === null) return false;
  if (r.requested_by === me || holds(me, 'ir.view_all') || holds(me, 'ir.decide')) return true;
  return r.kind === 'ofs' && r.ofs_sent_at !== null && (holds(me, 'ir.ofs_view') || holds(me, 'ir.ofs_decide'));
}

/** ir_owner_ok: I hold the request's capability, and it is nobody's, mine, or its owner no longer holds it. */
export function ownerOk(me: string, r: Row): boolean {
  const cap = decideCap(r);
  return holds(me, cap) && (r.owner_id === null || r.owner_id === me || !holds(r.owner_id, cap));
}

const WAITING = ['withdrawn', 'gc_review', 'returned'];

/** ir_decider: I decide the request now and it is past the GC; an OFS request not sent yet takes only the inspector's
 *  routing steps (postpone; the send is its own step). */
export function mustDecide(me: string, r: Row, routing = false): void {
  if (!ownerOk(me, r)) throw forbidden();
  if (WAITING.includes(r.status)) throw refuse('This request is not with the inspector.');
  if (r.kind === 'ofs' && r.ofs_sent_at === null && !routing) throw refuse('Send it to OFS first.');
}

interface JobFacts {
  /** The job's own GC step setting (ir_gc_approval). */
  gcStep: boolean;
  /** Somebody active on the job can do the GC step. */
  gcApprover: boolean;
}

/** ir_first_status: where a new request starts, by who files it (null: a visitor on the link) and its kind. */
export function firstStatus(me: string | null, kind: string, job: JobFacts): 'pending' | 'gc_review' {
  if (holds(me, 'ir.decide') || holds(me, 'ir.gc_approve')) return 'pending';
  if (job.gcStep) return 'gc_review';
  return kind === 'ofs' && job.gcApprover ? 'gc_review' : 'pending';
}

/** What a step reads beyond the request and its arguments. */
interface StepContext {
  me: string;
  now: string;
  /** ir_first_status for me on this job. */
  first: (kind: string) => string;
  /** A wall of the request has a result (ir_rev_items). */
  wallResult: boolean;
  /** permits.manage / permits.read (set_request_permit). */
  permits: { manage: boolean; read: boolean };
}

/** A step: the change to the row, or null when it changes nothing (the same row comes back). Throws its refusal. */
type Step = (r: Row, a: Args, c: StepContext) => Partial<Row> | null;

const NOT_POSTPONED = { postpone_reason: null, postpone_note: null, postpone_until: null, postponed_at: null };
const NO_HELPER_REPORT = { helper_report: null, helper_note: null, helper_at: null };
const NO_HELPER = 'An OFS request has no helper.';
const REASONS = ['not_ready', 'weather', 'gc_requested', 'other'];

function note(a: Args, k: string): string | null {
  const t = (opt(a, k) ?? '').trim();
  return t === '' ? null : t;
}

export const STEPS: Record<string, Step> = {
  ir_confirm: (r, a, c) => {
    mustDecide(c.me, r);
    return { status: r.ir_file_id ? 'complete' : 'confirmed', owner_id: c.me, confirm_note: note(a, 'p_note'), ...NOT_POSTPONED };
  },
  ir_unconfirm: (r, _a, c) => {
    mustDecide(c.me, r);
    if (r.status !== 'confirmed') throw refuse('Only a confirmed request can go back to pending.');
    return { status: 'pending' };
  },
  ir_set_attendance: (r, a, c) => {
    mustDecide(c.me, r);
    return { attendance: opt(a, 'p_attendance'), owner_id: c.me };
  },
  ir_set_result: (r, a, c) => {
    mustDecide(c.me, r);
    if (r.status === 'postponed') throw refuse('Confirm it again first.');
    const result = opt(a, 'p_result');
    const changed = result !== r.result;
    return {
      result, result_note: note(a, 'p_note'), owner_id: c.me, status: r.status === 'pending' ? 'confirmed' : r.status,
      result_photo_ids: Array.isArray(a['p_photo_ids']) ? (a['p_photo_ids'] as string[]) : [],
      result_at: changed ? c.now : r.result_at, result_by: changed ? c.me : r.result_by,
    };
  },
  // The inspector may postpone an OFS request before he sends it; after, only the deputy.
  ir_postpone: (r, a, c) => {
    mustDecide(c.me, r, true);
    const reason = opt(a, 'p_reason');
    if (reason === null || !REASONS.includes(reason)) throw refuse('Pick a reason.');
    if (reason === 'other' && note(a, 'p_note') === null) throw refuse('Add a note.');
    const until = opt(a, 'p_until');
    if (until !== null && until < r.request_date) throw refuse('The expected date is before the inspection.');
    const fresh = r.status !== 'postponed';
    return {
      status: 'postponed', postpone_reason: reason, postpone_note: note(a, 'p_note'), postpone_until: until,
      postponed_at: fresh ? c.now : r.postponed_at, postpone_count: r.postpone_count + (fresh ? 1 : 0), owner_id: c.me,
    };
  },
  // "The inspector" is whoever decides the request now; otherwise its requester, who sends it back down its route.
  ir_move: (r, a, c) => {
    const inspector = ownerOk(c.me, r);
    if (!inspector && r.requested_by !== c.me) throw forbidden();
    if (r.status === 'withdrawn' || r.status === 'complete' || r.result !== null) throw refuse("This inspection can't be moved.");
    const status = inspector
      ? (r.status === 'postponed' ? 'confirmed' : r.status)
      : r.status === 'gc_review' || r.status === 'returned' ? c.first(r.kind) : 'pending';
    const kind = opt(a, 'p_duration_kind') ?? 'timed';
    return {
      request_date: opt(a, 'p_request_date') ?? r.request_date, start_time: opt(a, 'p_start_time'), duration_kind: kind,
      duration_min: kind === 'timed' && typeof a['p_duration_min'] === 'number' ? a['p_duration_min'] : null, status,
      ...(status === 'postponed' ? {} : NOT_POSTPONED),
    };
  },
  ir_withdraw: (r, _a, c) => {
    if (r.requested_by !== c.me) throw forbidden();
    if (r.status === 'withdrawn' || r.status === 'complete' || r.result !== null) throw refuse("This inspection can't be withdrawn.");
    return { status: 'withdrawn' };
  },
  // Back at the start of its route. One that starts at the GC again is no longer with OFS.
  ir_restore: (r, _a, c) => {
    if (r.requested_by !== c.me || !holds(c.me, 'ir.request')) throw forbidden();
    if (r.status !== 'withdrawn') throw refuse('This inspection is not withdrawn.');
    const status = c.first(r.kind);
    const restart = r.kind === 'ofs' && status === 'gc_review';
    return { status, ...(restart ? { ofs_sent_at: null, ofs_sent_by: null, owner_id: null } : {}) };
  },
  // Once the inspector has sent it to OFS, the GC no longer takes it back.
  ir_gc_decide: (r, a, c) => {
    if (!holds(c.me, 'ir.gc_approve')) throw forbidden();
    const atGc = r.status === 'gc_review' || r.status === 'returned';
    if (!atGc && !(r.status === 'pending' && r.gc_at !== null && r.ofs_sent_at === null)) throw refuse('The inspector has this one now.');
    const approve = a['p_approve'] === true;
    if (!approve && note(a, 'p_note') === null) throw refuse('Add a reason.');
    return { status: approve ? 'pending' : 'returned', gc_by: c.me, gc_at: c.now, gc_note: note(a, 'p_note') };
  },
  // The inspector sends an OFS request to OFS (from pending, or from his own postponement): the deputy's from here.
  ir_send_ofs: (r, _a, c) => {
    if (!holds(c.me, 'ir.decide')) throw forbidden();
    if (r.kind !== 'ofs') throw refuse('Only an OFS request goes to OFS.');
    if (r.ofs_sent_at !== null) return null;
    if (!ownerOk(c.me, r)) throw forbidden();
    if (r.status !== 'pending' && r.status !== 'postponed') throw refuse('This request is not with the inspector.');
    return { ofs_sent_at: c.now, ofs_sent_by: c.me, status: 'pending', owner_id: null, ...NOT_POSTPONED };
  },
  // Undo of the send: the inspector who sent it, until the deputy has acted on it.
  ir_unsend_ofs: (r, _a, c) => {
    if (!holds(c.me, 'ir.decide') || r.ofs_sent_by !== c.me) throw forbidden();
    if (r.status !== 'pending' || r.owner_id !== null || r.result !== null || c.wallResult) throw refuse('OFS has this one now.');
    return { ofs_sent_at: null, ofs_sent_by: null };
  },
  // Claim and helpers are the inspectors' own; an OFS request has none.
  ir_claim: (r, _a, c) => {
    if (!holds(c.me, 'ir.decide')) throw forbidden();
    if (r.kind === 'ofs') throw refuse(NO_HELPER);
    if (WAITING.includes(r.status)) throw refuse('This request is not with the inspector.');
    if (ownerOk(c.me, r)) return r.owner_id === c.me ? null : { owner_id: c.me, helper_id: r.helper_id === c.me ? null : r.helper_id };
    if (r.helper_id === c.me) return null;
    if (r.helper_id !== null) throw refuse('This one already has a helper.');
    return { helper_id: c.me };
  },
  ir_assign_helper: (r, a, c) => {
    if (r.kind === 'ofs') throw refuse(NO_HELPER);
    const helper = opt(a, 'p_helper_id');
    // The helper steps off.
    if (helper === null && r.helper_id === c.me) return { helper_id: null, ...NO_HELPER_REPORT };
    mustDecide(c.me, r);
    if (helper !== null && (helper === c.me || !holds(helper, 'ir.decide'))) throw refuse('Pick another inspector on this job.');
    return { helper_id: helper, owner_id: c.me, ...NO_HELPER_REPORT };
  },
  ir_helper_report: (r, a, c) => {
    if (r.helper_id !== c.me || !holds(c.me, 'ir.decide')) throw forbidden();
    return { helper_report: opt(a, 'p_report'), helper_note: note(a, 'p_note'), helper_at: c.now };
  },
  ir_delete_pdf: (r, _a, c) => {
    mustDecide(c.me, r);
    if (r.ir_file_id === null) throw refuse('There is no PDF.');
    return {
      ir_file_id: null, content_hash: null, signed_at: null, signed_by: null, pdf_stale: false, pdf_postponed: false,
      status: r.status === 'complete' ? 'confirmed' : r.status,
    };
  },
  // Permits (0052): the official, whoever decides the request now, or its requester.
  set_request_permit: (r, a, c) => {
    if (!(c.permits.manage || holds(c.me, decideCap(r)) || r.requested_by === c.me) || !c.permits.read) throw forbidden();
    const permit = opt(a, 'p_permit_id');
    return permit === r.permit_id ? null : { permit_id: permit };
  },
};

/** The history word the database writes for each step. */
export function actionOf(name: string, a: Args, change: Partial<Row>): string {
  if (name === 'ir_gc_decide') return a['p_approve'] === true ? 'gc_approve' : 'gc_return';
  if (name === 'ir_claim') return 'owner_id' in change ? 'claim' : 'helper_claim';
  const map: Record<string, string> = {
    ir_set_result: 'result', ir_set_attendance: 'attendance', ir_assign_helper: 'helper', set_request_permit: 'permit',
    ir_delete_pdf: 'pdf_delete',
  };
  return map[name] ?? name.replace(/^ir_/, '');
}
