// Revs writes (migration 0056). Every write is its own RPC run as me, version-checked where it takes one; repeats are
// safe (the same list, rev, item or wall again returns it; the same request within 10 minutes is the first one).
// Remove answers the row's new version, which Restore (the Undo) sends back. Setup writes refresh the job's revs; the
// request, the map and the results also refresh the job's inspections, board and calendar.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './client';
import { throwIfError, throwIfErrorMaybe } from './errors';
import { callFunction } from './functions';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockRevs from './mock/revs';
import * as mockRequests from './mock/revRequests';
import type { IrRef } from './inspections.mutations';
import type { IrRequest, IrRowRaw } from './inspections.types';
import {
  type IrMapContext,
  irMapRenderSchema,
  revRemovedSchema,
  type IrStroke,
  type LegendRev,
  type NewOfsRequest,
  type Rev,
  type RevArea,
  type RevItem,
  type RevKind,
  type RevList,
  type RevMark,
  type RevRemoved,
  type RevResult,
} from './revs.types';
import type { Tables } from './database.types';

/** A SQL null for an argument the generated types call required (PostgREST passes JSON null through). */
function sqlNull<T>(v: T | null): T {
  return v as T;
}

function one<T>(data: T | T[]): T {
  return Array.isArray(data) ? (data[0] as T) : data;
}

function useRefreshRevs() {
  const qc = useQueryClient();
  return (projectId: string) => qc.invalidateQueries({ queryKey: qk.revs(projectId) });
}

/** A new list with its revs and items at once (revs.manage). */
export function useCreateRevList() {
  const refresh = useRefreshRevs();
  return useMutation({
    mutationFn: async (v: { projectId: string; name: string; phase: string; permitId: string | null; revs: LegendRev[] }): Promise<RevList> => {
      if (isMock()) return mockRevs.createList(v);
      const data = throwIfError(
        await supabase.rpc('rev_list_create', {
          p_project_id: v.projectId,
          p_name: v.name.trim(),
          p_phase: sqlNull(v.phase.trim() === '' ? null : v.phase.trim()),
          p_permit_id: sqlNull(v.permitId),
          p_revs: v.revs.map((r) => ({ number: r.number, name: r.name.trim(), items: r.items })),
        }),
      );
      return one(data);
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}

/** The list's name, phase and permit. */
export function useSaveRevList() {
  const refresh = useRefreshRevs();
  return useMutation({
    mutationFn: async (v: { list: RevList; name: string; phase: string; permitId: string | null }): Promise<RevList> => {
      if (isMock()) return mockRevs.saveList(v.list, v.name, v.phase, v.permitId);
      const data = throwIfError(
        await supabase.rpc('rev_list_save', {
          p_id: v.list.id,
          p_version: v.list.version,
          p_name: v.name.trim(),
          p_phase: sqlNull(v.phase.trim() === '' ? null : v.phase.trim()),
          p_permit_id: sqlNull(v.permitId),
        }),
      );
      return one(data);
    },
    onSettled: (_r, _e, v) => refresh(v.list.project_id),
  });
}

/** A rev of a list: rev null = new. */
export function useSaveRev() {
  const refresh = useRefreshRevs();
  return useMutation({
    mutationFn: async (v: { projectId: string; listId: string; rev: Rev | null; number: number; name: string }): Promise<Rev> => {
      if (isMock()) return mockRevs.saveRev(v.projectId, v.listId, v.rev, v.number, v.name);
      const data = throwIfError(
        await supabase.rpc('rev_save', {
          p_list_id: v.listId,
          p_id: sqlNull(v.rev?.id ?? null),
          p_version: sqlNull(v.rev?.version ?? null),
          p_number: v.number,
          p_name: v.name.trim(),
        }),
      );
      return one(data);
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}

/** An item of a rev: item null = new (at the end unless a place is given); position null = where it is. */
export function useSaveRevItem() {
  const refresh = useRefreshRevs();
  return useMutation({
    mutationFn: async (v: {
      projectId: string;
      revId: string;
      item: RevItem | null;
      name: string;
      company: string;
      position: number | null;
    }): Promise<RevItem> => {
      if (isMock()) return mockRevs.saveItem(v);
      const data = throwIfError(
        await supabase.rpc('rev_item_save', {
          p_rev_id: v.revId,
          p_id: sqlNull(v.item?.id ?? null),
          p_version: sqlNull(v.item?.version ?? null),
          p_name: v.name.trim(),
          p_company: sqlNull(v.company.trim() === '' ? null : v.company.trim()),
          p_position: sqlNull(v.position),
        }),
      );
      return one(data);
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}

/** Walls on a level of a list (one per line pasted); a wall already there comes back as it is. */
export function useAddRevAreas() {
  const refresh = useRefreshRevs();
  return useMutation({
    mutationFn: async (v: { projectId: string; listId: string; level: string; names: string[]; sheetFileId: string | null }): Promise<RevArea[]> => {
      if (isMock()) return mockRevs.addAreas(v);
      return throwIfError(
        await supabase.rpc('rev_areas_add', {
          p_list_id: v.listId,
          p_level: v.level.trim(),
          p_names: v.names.map((n) => n.trim()).filter((n) => n !== ''),
          p_sheet_file_id: sqlNull(v.sheetFileId),
        }),
      );
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}

/** A wall's level, name, sheet (null = none) and place (null = where it is). */
export function useSaveRevArea() {
  const refresh = useRefreshRevs();
  return useMutation({
    mutationFn: async (v: { area: RevArea; level: string; name: string; sheetFileId: string | null; position: number | null }): Promise<RevArea> => {
      if (isMock()) return mockRevs.saveArea(v);
      const data = throwIfError(
        await supabase.rpc('rev_area_save', {
          p_id: v.area.id,
          p_version: v.area.version,
          p_level: v.level.trim(),
          p_name: v.name.trim(),
          p_sheet_file_id: sqlNull(v.sheetFileId),
          p_position: sqlNull(v.position),
        }),
      );
      return one(data);
    },
    onSettled: (_r, _e, v) => refresh(v.area.project_id),
  });
}

interface RemoveInput {
  projectId: string;
  kind: RevKind;
  id: string;
  version: number;
}

/** Removes a list, rev, item or wall; the answer's version is what the Undo (useRestoreRev) sends. */
export function useRemoveRev() {
  const refresh = useRefreshRevs();
  return useMutation({
    mutationFn: async (v: RemoveInput): Promise<RevRemoved> => {
      if (isMock()) return mockRevs.remove(v.kind, v.id, v.version, true);
      const data: unknown = throwIfError(await supabase.rpc('rev_remove', { p_kind: v.kind, p_id: v.id, p_version: v.version }));
      return revRemovedSchema.parse(data);
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}

/** Undo of a remove. */
export function useRestoreRev() {
  const refresh = useRefreshRevs();
  return useMutation({
    mutationFn: async (v: RemoveInput): Promise<RevRemoved> => {
      if (isMock()) return mockRevs.remove(v.kind, v.id, v.version, false);
      const data: unknown = throwIfError(await supabase.rpc('rev_restore', { p_kind: v.kind, p_id: v.id, p_version: v.version }));
      return revRemovedSchema.parse(data);
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}

/** A wall that doesn't need an item: N/A on or off. */
export function useMarkRevNa() {
  const refresh = useRefreshRevs();
  return useMutation({
    mutationFn: async (v: { projectId: string; areaId: string; itemId: string; on: boolean }): Promise<RevMark | null> => {
      if (isMock()) return mockRevs.markNa(v.areaId, v.itemId, v.on);
      return throwIfErrorMaybe(await supabase.rpc('rev_mark_na', { p_area_id: v.areaId, p_item_id: v.itemId, p_on: v.on }));
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}

/** After a request-side write: the request, its cells and map, the job's revs, inspections, board and calendar. */
function useRefreshRequest() {
  const qc = useQueryClient();
  return (projectId: string, requestId: string | null) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: qk.revs(projectId) }),
      qc.invalidateQueries({ queryKey: qk.inspections(projectId) }),
      qc.invalidateQueries({ queryKey: qk.board(projectId) }),
      qc.invalidateQueries({ queryKey: qk.board(null) }),
      qc.invalidateQueries({ queryKey: qk.calendar }),
      ...(requestId === null
        ? []
        : [qc.invalidateQueries({ queryKey: qk.irRevItems(requestId) }), qc.invalidateQueries({ queryKey: qk.irMap(requestId) })]),
    ]);
}

/** The revs request: 1 to 3 items on walls of one list (an OFS inspection request; the database numbers it). */
export function useSubmitOfs() {
  const refresh = useRefreshRequest();
  return useMutation({
    mutationFn: async (v: NewOfsRequest): Promise<IrRowRaw> => {
      if (isMock()) return mockRequests.submit(v);
      const data = throwIfError(
        await supabase.rpc('ir_submit_ofs', {
          p_project_id: v.projectId,
          p_company: v.company.trim(),
          p_request_date: v.date,
          p_notice_ack: v.noticeAck,
          p_area_ids: v.areaIds,
          p_item_ids: v.itemIds,
          p_duration_kind: v.durationKind,
          p_attachment_ids: v.attachmentIds,
          ...(v.sheetFileId !== null ? { p_sheet_file_id: v.sheetFileId } : {}),
          ...(v.startTime !== null ? { p_start_time: v.startTime } : {}),
          ...(v.durationMin !== null ? { p_duration_min: v.durationMin } : {}),
        }),
      );
      return one(data);
    },
    onSettled: (r, _e, v) => refresh(v.projectId, r?.id ?? null),
  });
}

/** Saves what is drawn: strokes (in the request's colors), and the sheet / page when picked (null = keep). */
export function useSaveIrMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      requestId: string;
      version: number;
      strokes: IrStroke[];
      sheetFileId: string | null;
      page: number | null;
    }): Promise<Tables<'ir_maps'>> => {
      if (isMock()) return mockRequests.saveMap(v);
      const data = throwIfError(
        await supabase.rpc('ir_map_save', {
          p_request_id: v.requestId,
          p_version: v.version,
          p_strokes: v.strokes,
          ...(v.sheetFileId !== null ? { p_sheet_file_id: v.sheetFileId } : {}),
          ...(v.page !== null ? { p_page: v.page } : {}),
        }),
      );
      return one(data);
    },
    // The next save carries the new version at once, before the refetch lands.
    onSuccess: (row, v) => {
      qc.setQueryData<IrMapContext>(qk.irMap(v.requestId), (old) =>
        old ? { ...old, version: row.version, sheet_file_id: row.sheet_file_id, page: row.page, stale: row.stale, strokes: v.strokes } : old,
      );
    },
    onSettled: (_r, _e, v) => qc.invalidateQueries({ queryKey: qk.irMap(v.requestId) }),
  });
}

/** Renders the map PDF on the server (ir-map) and answers its file. */
export function useRenderIrMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string): Promise<{ file_id: string }> => {
      if (isMock()) return mockRequests.renderMap(requestId);
      return callFunction('ir-map', { action: 'render', request_id: requestId }, irMapRenderSchema);
    },
    onSettled: (_r, _e, requestId) => qc.invalidateQueries({ queryKey: qk.irMap(requestId) }),
  });
}

/** The inspector's result for every cell (null clears them: the Undo); the request's result follows. */
export function useSetRevResults() {
  const refresh = useRefreshRequest();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { row: IrRef; results: RevResult[] | null }): Promise<IrRowRaw> => {
      if (isMock()) return mockRequests.setResults(v.row, v.results);
      const data = throwIfError(
        await supabase.rpc('ir_rev_results', {
          p_request_id: v.row.id,
          p_version: v.row.version,
          p_results: sqlNull(v.results?.map((r) => ({ ...r, note: r.note?.trim() ?? null })) ?? null),
        }),
      );
      return one(data);
    },
    onSuccess: (row) => {
      qc.setQueryData<IrRequest | null>(qk.inspectionsPart(row.project_id, 'request', row.id), (old) => (old ? { ...old, ...row } : old));
    },
    onSettled: (_r, _e, v) => refresh(v.row.project_id, v.row.id),
  });
}
