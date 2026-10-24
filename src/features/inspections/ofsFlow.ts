// Who may tap what on an OFS request (0091), as the database decides it (ir_ofs_check, ir_send_ofs) on the job's route
// (0116): the screens show a tap only to whoever the database will let do it. The route's one line, and where a request
// is on it.
import type { OfsRouteInfo, OfsRouteStep } from '../../data/inspections.ofs';
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

/** Ready is a step only where the duty holder sends; elsewhere the inspector's Send is his Ready (0116). */
export function ofsCheckRights(r: Row, can: Pick<IrCan, 'gcApprove' | 'decide'>, me: string, route: OfsRouteInfo): OfsRights {
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
  const readyStep = route.sender === 'duty';
  return {
    gc: can.gcApprove && atGc && !sent,
    gcUndo: can.gcApprove && r.status === 'pending' && r.gc_at !== null && !ready && !sent,
    ready: mine && readyStep && !ready,
    readyUndo: mine && ready && !si,
    si: siOpen && !si && (ready || sent || !readyStep),
    siUndo: siOpen && si,
  };
}

/** Send to OFS is mine on this route: the duty holder's where he sends, else the inspector's. */
export function sendsHere(route: OfsRouteInfo, who: { inspector: boolean; holder: boolean }): boolean {
  return route.sender === 'duty' ? who.holder : who.inspector;
}

/** Send to OFS now: the inspector on his own word (his send is his Ready), the duty holder once the inspector has
 *  checked it (and its special inspection report, when one is required). */
export function canSend(r: Row, route: OfsRouteInfo): boolean {
  if (route.sender === 'inspector') return true;
  return r.ofs_ready_at !== null && (r.special_required !== true || r.ofs_si_at !== null);
}

type StopKey = 'gc' | 'inspector' | 'send' | 'ofs';

/** The route's stops in order: "Contractor checks > Inspector sends > Fire marshal". */
export function routeStops(route: OfsRouteInfo): { key: StopKey; label: string }[] {
  return [
    ...(route.gc ? [{ key: 'gc' as const, label: 'Contractor checks' }] : []),
    ...(route.sender === 'duty'
      ? [
          { key: 'inspector' as const, label: 'Inspector ready' },
          { key: 'send' as const, label: 'OFS person sends' },
        ]
      : [{ key: 'send' as const, label: 'Inspector sends' }]),
    { key: 'ofs' as const, label: 'Fire marshal' },
  ];
}

/** The stop a request is at (ir_ofs_step), the fire marshal once it is sent, else none. */
export function routeAt(step: OfsRouteStep, sent: boolean): StopKey | null {
  if (step === 'gc') return 'gc';
  if (step === 'ready' || step === 'si') return 'inspector';
  if (step === 'send') return 'send';
  return sent ? 'ofs' : null;
}
