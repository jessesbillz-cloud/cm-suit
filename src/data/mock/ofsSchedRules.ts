// OFS scheduling's rules for the e2e mock (0108), as the database has them: Pick another time (ir_ofs_propose), Accept
// (ir_ofs_accept), what Confirm records on an OFS request sent to OFS, and tg_ir_ofs_sched (an answer stays until the
// request moves on some other way). mock/inspections applies them. Board lines and Needs you tasks are not mocked.
import { todayInZone } from '../../lib/dates';
import type { IrRowRaw } from '../inspections.types';
import { forbidden, holds, mustDecide, opt, refuse, type Step } from './irRules';

type Row = IrRowRaw;

/** The sample jobs' zone. */
const TZ = 'America/Los_Angeles';
const ANSWERS: readonly string[] = ['ir_confirm', 'ir_ofs_propose', 'ir_ofs_accept'];
const NO_ANSWER = { ofs_sched: null, ofs_sched_by: null, ofs_sched_at: null, ofs_sched_note: null };
const NOT_POSTPONED = { postpone_reason: null, postpone_note: null, postpone_until: null, postponed_at: null };

function sentToOfs(r: Row): boolean {
  return r.kind === 'ofs' && r.ofs_sent_at !== null;
}

function note(a: Record<string, unknown>): string | null {
  const t = (opt(a, 'p_note') ?? '').trim();
  return t === '' ? null : t;
}

/** ir_confirm's extra on an OFS request sent to OFS: the fire marshal's answer, who and when. */
export function confirmAnswer(r: Row, me: string, now: string, a: Record<string, unknown>): Partial<Row> {
  return sentToOfs(r) ? { ofs_sched: 'confirmed', ofs_sched_by: me, ofs_sched_at: now, ofs_sched_note: note(a) } : NO_ANSWER;
}

/** tg_ir_ofs_sched: another time asked, postponed, back to pending, back with the GC or unsent clears the answer. */
export function schedAfter(step: string, before: Row, after: Row): Partial<Row> {
  if (after.ofs_sched === null || ANSWERS.includes(step)) return {};
  const moved =
    after.request_date !== before.request_date ||
    after.start_time !== before.start_time ||
    after.duration_kind !== before.duration_kind ||
    after.duration_min !== before.duration_min;
  const gone = after.ofs_sent_at === null || ['withdrawn', 'gc_review', 'returned', 'postponed'].includes(after.status);
  const back = before.status === 'confirmed' && after.status === 'pending';
  return moved || gone || back ? NO_ANSWER : {};
}

export const SCHED_STEPS: Record<string, Step> = {
  ir_ofs_propose: (r, a, c) => {
    mustDecide(c.me, r);
    if (!sentToOfs(r) || !holds(c.me, 'ir.ofs_decide')) throw forbidden();
    if (r.status === 'complete' || r.result !== null) throw refuse("This inspection can't be moved.");
    const date = opt(a, 'p_date');
    if (date === null || date < todayInZone(TZ)) throw refuse('Pick today or a later day.');
    const time = opt(a, 'p_time');
    if (time === null) throw refuse('Pick a time.');
    if (!/^\d{2}:(00|30)$/.test(time.slice(0, 5))) throw refuse('Pick a time on the hour or half hour.');
    if (r.request_date === date && r.start_time?.slice(0, 5) === time.slice(0, 5) && r.status !== 'postponed') {
      throw refuse('That is the asked time. Confirm it instead.');
    }
    return {
      request_date: date, start_time: time.slice(0, 5), duration_kind: 'timed',
      duration_min: r.duration_kind === 'timed' ? (r.duration_min ?? 60) : 60, status: 'pending', owner_id: c.me, ...NOT_POSTPONED,
      ofs_sched: 'proposed', ofs_sched_by: c.me, ofs_sched_at: c.now, ofs_sched_note: note(a),
    };
  },
  ir_ofs_accept: (r, _a, c) => {
    if (r.requested_by !== c.me && !c.sender) throw forbidden();
    if (r.ofs_sched !== 'proposed' || r.status !== 'pending' || r.result !== null) throw refuse('There is no new time to accept.');
    return { status: 'confirmed', ofs_sched: 'accepted', ofs_sched_by: c.me, ofs_sched_at: c.now };
  },
};
