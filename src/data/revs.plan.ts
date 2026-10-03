// Walls on the plan (migration 0059): a new wall drawn on its plan sheet and named (rev_area_draw), and a wall's place
// set at once: its sheet, page and line, version-checked; a null line takes it off the plan (rev_area_place). Undo of a
// new wall is rev_remove (useRemoveRev); Undo of a place sends the old place back with the new version. Both refresh
// the job's revs.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './client';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockPlan from './mock/revPlan';
import { parseArea, type RevArea, type WallLine } from './revs.types';

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

interface DrawnWall {
  projectId: string;
  listId: string;
  level: string;
  name: string;
  sheetFileId: string;
  /** 1-based page of the sheet PDF. */
  page: number;
  geom: WallLine;
}

/** A new wall drawn on the plan (revs.manage). The same wall again comes back as it is. */
export function useDrawRevArea() {
  const refresh = useRefreshRevs();
  return useMutation({
    mutationFn: async (v: DrawnWall): Promise<RevArea> => {
      if (isMock()) return mockPlan.drawArea(v);
      const data = throwIfError(
        await supabase.rpc('rev_area_draw', {
          p_list_id: v.listId,
          p_level: v.level.trim(),
          p_name: v.name.trim(),
          p_sheet_file_id: v.sheetFileId,
          p_page: v.page,
          p_geom: v.geom,
        }),
      );
      return parseArea(one(data));
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}

/** A wall's place on the plan: sheet, page and line (null: off the plan). */
export function usePlaceRevArea() {
  const refresh = useRefreshRevs();
  return useMutation({
    mutationFn: async (v: { area: RevArea; sheetFileId: string | null; page: number; geom: WallLine | null }): Promise<RevArea> => {
      if (isMock()) return mockPlan.placeArea(v);
      const data = throwIfError(
        await supabase.rpc('rev_area_place', {
          p_id: v.area.id,
          p_version: v.area.version,
          p_sheet_file_id: sqlNull(v.sheetFileId),
          p_page: v.page,
          p_geom: sqlNull(v.geom),
        }),
      );
      return parseArea(one(data));
    },
    onSettled: (_r, _e, v) => refresh(v.area.project_id),
  });
}
