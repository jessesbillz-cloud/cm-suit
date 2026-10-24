// e2e mock of Work it here (0117), with the database's rules (ir_work_here): whoever decides inspections on the job, on
// a copy from MDR they read; the version check; a number one of the job's own requests carries is refused; the same tap
// again answers the row. The copy keeps everything, its MDR id moves to mdr_source_id.
import { conflictError, DataError } from '../errors';
import type { IrRowRaw } from '../inspections.types';
import { mockUser } from './index';
import { everyRequest, patchRequest, readable } from './inspections';
import { forbidden, holds, refuse, type Args } from './irRules';
import { delay } from './store';

export async function workHere(a: Args): Promise<IrRowRaw> {
  await delay();
  const me = mockUser().id;
  const r = readable(a['p_request_id']);
  if (!holds(me, 'ir.decide')) throw forbidden();
  if (r.mdr_id === null && r.mdr_source_id !== null) return r;
  if (r.mdr_id === null) throw refuse("This request is already the suite's own.");
  if (r.version !== a['p_version']) throw conflictError();
  if (everyRequest().some((o) => o.project_id === r.project_id && o.number === r.number && o.mdr_id === null)) {
    const message = `IR ${String(r.number)} is already one of this job's own requests, so this copy stays view only.`;
    throw new DataError('That already exists.', '23505', message);
  }
  const patch = { mdr_id: null, mdr_source_id: r.mdr_id, mdr_detached_at: new Date().toISOString(), mdr_detached_by: me };
  return patchRequest(r.id, r.version, patch, 'mdr_work_here', true);
}
