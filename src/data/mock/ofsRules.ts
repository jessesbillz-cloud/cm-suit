// The OFS request flow's rules for the e2e mock (0091), as the database has them: the stamps a new OFS request gets at
// insert (the sub's attestation with the job's wording, the inspector's Ready on his own, the GC's Ready on the GC's),
// the checks in order with their Undo, the OFS number a sender types, and the checks cleared when a request goes back
// to the GC. mock/inspections applies them.
import { parseProjectSettings } from '../../lib/settings';
import type { IrRowRaw } from '../inspections.types';
import { forbidden, holds, opt, ownerOk, refuse, type Step } from './irRules';
import { projectSettings } from './jobs';

type Row = IrRowRaw;

/** ir_ofs_attest_wording's standard wording (the database holds the one default). */
const STANDARD_ATTEST = 'To the best of my knowledge, the work listed is complete and ready for inspection.';
const AT_GC: readonly string[] = ['gc_review', 'returned'];
const WITH_OFS_NOW = 'OFS has this one now.';

/** ir_ofs_attest_wording: the job's own words, or the standard ones. */
export function wording(projectId: string): string {
  return parseProjectSettings(projectSettings(projectId)).ir_ofs_attest_text ?? STANDARD_ATTEST;
}

/** tg_ir_ofs_stamp at insert. `by` null: a visitor on the link. */
export function stampOnFile(row: Row, by: string | null): Partial<Row> {
  if (row.kind !== 'ofs') return {};
  if (holds(by, 'ir.decide')) return { ofs_ready_by: by, ofs_ready_at: row.created_at };
  const gc = by !== null && holds(by, 'ir.gc_approve') && row.status === 'pending';
  return {
    ofs_attest_by: by, ofs_attest_at: row.created_at, ofs_attest_text: wording(row.project_id),
    ...(gc ? { gc_by: by, gc_at: row.created_at } : {}),
  };
}

/** tg_ir_ofs_stamp on update: back with the GC, the inspector checks it again. */
export function backToGc(before: Row, after: Row): Partial<Row> {
  if (after.kind !== 'ofs' || !AT_GC.includes(after.status) || AT_GC.includes(before.status)) return {};
  return { ofs_ready_by: null, ofs_ready_at: null, ofs_si_by: null, ofs_si_at: null, ofs_si_file_id: null };
}

function gcCheck(r: Row, on: boolean, me: string, now: string): Partial<Row> | null {
  if (!holds(me, 'ir.gc_approve')) throw forbidden();
  if (r.ofs_sent_at !== null) throw refuse(WITH_OFS_NOW);
  if (on) return AT_GC.includes(r.status) ? { status: 'pending', gc_by: me, gc_at: now, gc_note: null } : null;
  if (r.status !== 'pending' || r.gc_at === null) return null;
  if (r.ofs_ready_at !== null) throw refuse('The inspector has checked it.');
  return { status: 'gc_review', gc_by: null, gc_at: null };
}

export const OFS_STEPS: Record<string, Step> = {
  ir_ofs_check: (r, a, c) => {
    const check = opt(a, 'p_check');
    const on = a['p_on'] === true;
    if (check !== 'gc' && check !== 'ready' && check !== 'si') throw refuse('Unknown check.');
    if (r.kind !== 'ofs') throw refuse('Only an OFS request has these checks.');
    if (check === 'gc') return gcCheck(r, on, c.me, c.now);
    if (!holds(c.me, 'ir.decide')) throw forbidden();
    if ([...AT_GC, 'withdrawn'].includes(r.status)) throw refuse('This request is not with the inspector.');
    if (check === 'ready') {
      if (r.ofs_sent_at !== null) throw refuse(WITH_OFS_NOW);
      if (!ownerOk(c.me, r)) throw forbidden();
      if (on === (r.ofs_ready_at !== null)) return null;
      if (!on && r.ofs_si_at !== null) throw refuse('Undo the special inspection report first.');
      return on ? { ofs_ready_by: c.me, ofs_ready_at: c.now } : { ofs_ready_by: null, ofs_ready_at: null };
    }
    if (r.special_required !== true) throw refuse('No special inspection on this request.');
    const untouched = r.status === 'pending' && r.owner_id === null && r.result === null && !c.wallResult;
    if (r.ofs_sent_at !== null && !untouched) throw refuse(WITH_OFS_NOW);
    if (on && r.ofs_ready_at === null && r.ofs_sent_at === null) throw refuse('Check Ready first.');
    const file = opt(a, 'p_file_id');
    if (!on) return r.ofs_si_at === null ? null : { ofs_si_by: null, ofs_si_at: null, ofs_si_file_id: null };
    if (r.ofs_si_at !== null && (file === null || file === r.ofs_si_file_id)) return null;
    return { ofs_si_by: r.ofs_si_by ?? c.me, ofs_si_at: r.ofs_si_at ?? c.now, ofs_si_file_id: file ?? r.ofs_si_file_id };
  },
  ir_ofs_number_set: (r, a, c) => {
    if (!c.sender) throw forbidden();
    if (r.kind !== 'ofs') throw refuse('Only an OFS request has an OFS number.');
    if (r.signed_at !== null || r.status === 'withdrawn') throw refuse('The OFS number is set.');
    const n = a['p_number'];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 999999) throw refuse('Type a number from 1 to 999999.');
    if (n === r.ofs_number) return null;
    if (c.numberTaken(n)) throw refuse(`OFS ${String(n)} is taken on this job.`);
    return { ofs_number: n };
  },
};
