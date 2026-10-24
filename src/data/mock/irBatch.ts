// e2e mock of the batch steps (0114) with the database's rules in short form: a request waits on me at a step when it
// is at that step of the job's route (0116, mock/ofsRules ofsStep) and I may take it (the GC step, the inspector's Ready
// while it is his, Send to OFS for whoever sends on this route); the step I take on a batch is the earliest with
// requests waiting on me; Needs you lists it only when it is my turn on one of them (ofsRules turn); the step for the
// batch runs the single step (mock/inspections rpc) on each waiting request with its version, all or nothing, and skips
// what is past the step.
import type { IrRowRaw } from '../inspections.types';
import type { BatchStep, BatchStepAnswer, IrBatch } from '../inspections.batch';
import { conflictError } from '../errors';
import { holder } from './duties';
import { mockUser } from './index';
import * as mockIr from './inspections';
import { forbidden, holds, maySee, notFound, ownerOk } from './irRules';
import { ofsStep, route, turn } from './ofsRules';
import { batchIds, batchRequests } from './revBasket';
import { read as readRevs } from './revs';
import { delay } from './store';

const ORDER: readonly BatchStep[] = ['gc', 'send', 'ready'];

const sender = (me: string, projectId: string) => holds(me, 'ir.decide') || holder(projectId) === me;

/** ir_batch_waits: at this step of its route (never a copy from My Daily Reports, 0112), and mine to take (ir_ofs_may). */
function waits(r: IrRowRaw, step: BatchStep, me: string): boolean {
  if (ofsStep(r) !== step) return false;
  if (step === 'gc') return holds(me, 'ir.gc_approve');
  if (step === 'ready') return holds(me, 'ir.decide') && ownerOk(me, r);
  return route(r.project_id).sender === 'duty' ? holder(r.project_id) === me : holds(me, 'ir.decide') && ownerOk(me, r);
}

const byNumber = (a: IrRowRaw, b: IrRowRaw) => (a.ofs_number ?? 0) - (b.ofs_number ?? 0) || a.number - b.number;

/** The batch's requests I read, in order. */
function rowsOf(batchId: string): IrRowRaw[] {
  const ids = batchRequests(batchId);
  const me = mockUser().id;
  return mockIr.everyRequest().filter((r) => ids.includes(r.id) && maySee(me, r)).sort(byNumber);
}

/** "Level 01 · Top of wall & HOW Spray": the levels, then the items in rev order. */
function itemsLine(ids: readonly string[]): string {
  const s = readRevs();
  const cells = s.cells.filter((c) => ids.includes(c.request_id));
  const levels = [...new Set(cells.map((c) => s.areas.find((a) => a.id === c.area_id)?.level.trim() ?? ''))].filter((l) => l !== '').sort();
  const rank = (id: string) => {
    const i = s.items.find((x) => x.id === id);
    return [s.revs.find((v) => v.id === i?.rev_id)?.number ?? 0, i?.position ?? 0] as const;
  };
  const items = [...new Set(cells.map((c) => c.item_id))]
    .sort((a, b) => rank(a)[0] - rank(b)[0] || rank(a)[1] - rank(b)[1])
    .map((id) => s.items.find((x) => x.id === id)?.name.trim() ?? '');
  return [levels.join(', '), items.join(' & ')].filter((x) => x !== '').join(' · ');
}

/** One transaction for several steps: undo puts every request back as it was. */
function snapshot(): () => void {
  const raw = window.sessionStorage.getItem(mockIr.KEY);
  return () => {
    if (raw === null) window.sessionStorage.removeItem(mockIr.KEY);
    else window.sessionStorage.setItem(mockIr.KEY, raw);
  };
}

function view(batchId: string): IrBatch | null {
  const me = mockUser().id;
  const rows = rowsOf(batchId).filter((r) => r.status !== 'withdrawn');
  const first = rows[0];
  if (first === undefined) return null;
  const step = ORDER.find((k) => rows.some((r) => waits(r, k, me))) ?? null;
  return {
    batch_id: batchId,
    project_id: first.project_id,
    size: rows.length,
    items: itemsLine(rows.map((r) => r.id)),
    step,
    route: route(first.project_id),
    requests: rows.map((r) => ({
      id: r.id, number: r.number, ofs_number: r.ofs_number, items: r.items, status: r.status, result: r.result,
      helper_id: r.helper_id, ofs_sent_at: r.ofs_sent_at, version: r.version, waits: step !== null && waits(r, step, me),
    })),
  };
}

/** ir_batch_get */
export async function get(batchId: string): Promise<IrBatch> {
  await delay();
  const b = view(batchId);
  if (b === null) throw notFound();
  return b;
}

/** My turn on a request of the batch that waits on me (ir_batches_waiting, 0116). */
function myTurn(b: IrBatch, me: string): boolean {
  const waiting = new Set(b.requests.filter((x) => x.waits).map((x) => x.id));
  return rowsOf(b.batch_id).some((r) => waiting.has(r.id) && turn(r).includes(me));
}

/** ir_batches_waiting */
export async function waiting(projectId: string | null): Promise<IrBatch[]> {
  await delay();
  const me = mockUser().id;
  const all = batchIds().map((id) => view(id));
  return all.filter(
    (b): b is IrBatch => b !== null && b.step !== null && b.size >= 2 && (projectId === null || b.project_id === projectId) && myTurn(b, me),
  );
}

/** ir_batch_step */
export async function step(batchId: string, which: BatchStep, versions: Record<string, number>): Promise<BatchStepAnswer> {
  await delay();
  const me = mockUser().id;
  const rows = rowsOf(batchId);
  const first = rows[0];
  if (first === undefined) throw notFound();
  const may = which === 'gc' ? holds(me, 'ir.gc_approve') : which === 'ready' ? holds(me, 'ir.decide') : sender(me, first.project_id);
  if (!may) throw forbidden();
  const undo = snapshot();
  const done: BatchStepAnswer['done'] = [];
  const skipped: string[] = [];
  try {
    for (const r of rows) {
      if (!waits(r, which, me)) {
        if (r.id in versions) skipped.push(r.id);
        continue;
      }
      const v = versions[r.id];
      if (v === undefined) throw conflictError();
      const row =
        which === 'send'
          ? await mockIr.rpc('ir_send_ofs', { p_request_id: r.id, p_version: v })
          : await mockIr.rpc('ir_ofs_check', { p_request_id: r.id, p_version: v, p_check: which, p_on: true });
      done.push({ id: row.id, number: row.number, ofs_number: row.ofs_number, status: row.status, version: row.version });
    }
  } catch (e) {
    undo();
    throw e;
  }
  return { batch_id: batchId, step: which, done, skipped };
}
