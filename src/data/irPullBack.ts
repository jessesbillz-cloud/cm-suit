// Not ready (0109): the requester (the job's OFS duty holder, the GC step) takes walls x items off an OFS request until a
// result is recorded, also once it is with OFS, and Undo puts the same ones back. Each answers the request as it is
// now; the request, its cells and map, Revs and the boards refresh for everyone who reads them.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './client';
import { throwIfError } from './errors';
import type { IrRef } from './inspections.mutations';
import type { IrRequest, IrRowRaw } from './inspections.types';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockPull from './mock/revPullBack';
import { useRefreshRequest } from './revs.mutations';

/** One wall x item of the request. */
interface CellRef {
  area_id: string;
  item_id: string;
}

interface PullInput {
  row: IrRef;
  cells: CellRef[];
  /** true: put them back (the Undo). */
  back: boolean;
}

async function pull(v: PullInput): Promise<IrRowRaw> {
  const cells = v.cells.map((c) => ({ area_id: c.area_id, item_id: c.item_id }));
  if (isMock()) return mockPull.pullBack(v.row, cells, v.back);
  const args = { p_request_id: v.row.id, p_version: v.row.version, p_cells: cells };
  const data = throwIfError(await (v.back ? supabase.rpc('ir_rev_put_back', args) : supabase.rpc('ir_rev_pull_back', args)));
  return Array.isArray(data) ? (data[0] as IrRowRaw) : data;
}

/** Take cells off (back false) or put them back (back true). */
export function usePullBack() {
  const refresh = useRefreshRequest();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: pull,
    onSuccess: (row) => {
      qc.setQueryData<IrRequest | null>(qk.inspectionsPart(row.project_id, 'request', row.id), (old) => (old ? { ...old, ...row } : old));
    },
    onSettled: (_r, _e, v) => refresh(v.row.project_id, v.row.id),
  });
}
