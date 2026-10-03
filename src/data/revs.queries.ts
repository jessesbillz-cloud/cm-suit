// Revs reads (migration 0056): a job's setup (lists, revs, items, walls, N/A marks; RLS: revs.read), the status of every
// wall x item, and an OFS request's cells and map (whoever may read the request). The request's own pieces refetch every
// 30 seconds while on screen, like the request itself (an inspector's result or signature can land meanwhile).
import { skipToken, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockRevs from './mock/revs';
import * as mockRequests from './mock/revRequests';
import {
  IR_REV_ITEM_COLS,
  REV_AREA_COLS,
  REV_COLS,
  REV_ITEM_COLS,
  REV_LIST_COLS,
  REV_MARK_COLS,
  irMapContextSchema,
  liveSetup,
  parseArea,
  revStatusRowSchema,
  type IrMapContext,
  type IrRevItem,
  type RevSetup,
  type RevStatusRow,
} from './revs.types';

const LIVE_MS = 30_000;

async function fetchSetup(projectId: string): Promise<RevSetup> {
  if (isMock()) return liveSetup(await mockRevs.setup(projectId));
  const [lists, revs, items, areas, marks] = await Promise.all([
    supabase.from('rev_lists').select(REV_LIST_COLS).eq('project_id', projectId),
    supabase.from('revs').select(REV_COLS).eq('project_id', projectId),
    supabase.from('rev_items').select(REV_ITEM_COLS).eq('project_id', projectId),
    supabase.from('rev_areas').select(REV_AREA_COLS).eq('project_id', projectId),
    supabase.from('rev_marks').select(REV_MARK_COLS).eq('project_id', projectId),
  ]);
  return liveSetup({
    lists: throwIfError(lists),
    revs: throwIfError(revs),
    items: throwIfError(items),
    areas: throwIfError(areas).map(parseArea),
    marks: throwIfError(marks),
  });
}

/** The job's lists with their revs and items, its walls and N/A marks: live rows, in order. `enabled` false: not yet. */
export function useRevSetup(projectId: string, enabled = true) {
  return useQuery({ queryKey: qk.revsPart(projectId, 'setup'), queryFn: () => fetchSetup(projectId), enabled });
}

async function fetchStatus(projectId: string): Promise<RevStatusRow[]> {
  if (isMock()) return mockRequests.status(projectId);
  const rows: unknown = throwIfError(await supabase.rpc('rev_status', { p_project_id: projectId }));
  return z.array(revStatusRowSchema).parse(rows);
}

/** Every wall x item of the job's lists: na, passed, requested, failed or open, with the request that decides it. */
export function useRevStatus(projectId: string) {
  return useQuery({ queryKey: qk.revsPart(projectId, 'status'), queryFn: () => fetchStatus(projectId) });
}

async function fetchCells(requestId: string): Promise<IrRevItem[]> {
  if (isMock()) return mockRequests.cells(requestId);
  return throwIfError(await supabase.from('ir_rev_items').select(IR_REV_ITEM_COLS).eq('request_id', requestId).order('color'));
}

/** An OFS request's cells (wall x item), each with its color and result. Empty for any other request. */
export function useIrRevItems(requestId: string | null) {
  return useQuery({
    queryKey: qk.irRevItems(requestId ?? ''),
    queryFn: requestId ? () => fetchCells(requestId) : skipToken,
    refetchInterval: LIVE_MS,
  });
}

async function fetchMap(requestId: string): Promise<IrMapContext> {
  if (isMock()) return mockRequests.mapContext(requestId);
  return irMapContextSchema.parse(throwIfError(await supabase.rpc('ir_map_context', { p_request_id: requestId })));
}

/** An OFS request's map: title parts, legend, sheet and strokes, the rendered PDF's state, and whether I may draw. */
export function useIrMap(requestId: string | null) {
  return useQuery({
    queryKey: qk.irMap(requestId ?? ''),
    queryFn: requestId ? () => fetchMap(requestId) : skipToken,
    refetchInterval: LIVE_MS,
  });
}
