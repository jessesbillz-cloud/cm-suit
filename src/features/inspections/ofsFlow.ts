// Who may tap what on an OFS request (0091), as the database decides it (ir_ofs_check, ir_send_ofs): the screens show a
// tap only to whoever the database will let do it.
import type { IrRequest } from '../../data/inspections.types';
import { ownsSteps } from './model';
import type { IrCan } from './useIrAccess';

type Row = Pick<
  IrRequest,
  | 'kind'
  | 'status'
  | 'gc_at'
  | 'owner_id'
  | 'result'
  | 'ofs_sent_at'
  | 'ofs_sent_by'
  | 'ofs_ready_at'
  | 'ofs_si_at'
  | 'special_required'
>;

const AT_GC: readonly string[] = ['gc_review', 'returned'];

interface OfsRights {
  gc: boolean;
  gcUndo: boolean;
  ready: boolean;
  readyUndo: boolean;
  si: boolean;
  siUndo: boolean;
}

export function ofsCheckRights(r: Row, can: Pick<IrCan, 'gcApprove' | 'decide'>, me: string): OfsRights {
  const sent = r.ofs_sent_at !== null;
  const atGc = AT_GC.includes(r.status);
  const withInspector = !atGc && r.status !== 'withdrawn';
  // Sent, and OFS has not acted on it yet.
  const untouched = r.status === 'pending' && r.owner_id === null && r.result === null;
  const ready = r.ofs_ready_at !== null;
  const si = r.ofs_si_at !== null;
  const inspector = can.decide && withInspector;
  const mine = inspector && !sent && ownsSteps(r, me);
  const siOpen = inspector && r.special_required === true && (!sent || untouched);
  return {
    gc: can.gcApprove && atGc && !sent,
    gcUndo: can.gcApprove && r.status === 'pending' && r.gc_at !== null && !ready && !sent,
    ready: mine && !ready,
    readyUndo: mine && ready && !si,
    si: siOpen && !si && (ready || sent),
    siUndo: siOpen && si,
  };
}

/** Send to OFS: the inspector on his own word (his send is his Ready), the duty holder once the inspector has checked
 *  it (and its special inspection report, when one is required). */
export function canSend(r: Row, inspector: boolean): boolean {
  if (inspector) return true;
  return r.ofs_ready_at !== null && (r.special_required !== true || r.ofs_si_at !== null);
}
