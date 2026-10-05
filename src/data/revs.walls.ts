// What each rated wall is, and what was signed off before the app (migration 0082). A wall's details (tag, rating, UL
// design, fire area, sheet number, what to check) are one version-checked save (rev_area_details_save). A wall's items
// signed off on paper before the app (OFS IR number, day, note) are set many at once, a whole rev too
// (rev_signoff_set), and cleared for the Undo (rev_signoff_clear, which answers what it cleared so its own Undo can put
// it back). Sign-offs change the walls' status and so the permits' open inspections: both refresh.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Tables } from './database.types';
import { supabase } from './client';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockWalls from './mock/revWalls';
import { parseArea, type RevArea, type WallDetails } from './revs.types';

/** A sign-off made before the app: what rev_signoff_set and rev_signoff_clear answer. */
export type RevSignoff = Pick<Tables<'rev_signoffs'>, 'id' | 'area_id' | 'item_id' | 'ofs_number' | 'signed_on' | 'note'>;

/** What a sign-off says: the OFS IR number, the day ("yyyy-MM-dd") and a note, each optional. */
export interface SignoffValues {
  ofsNumber: number | null;
  signedOn: string | null;
  note: string | null;
}

/** A SQL null for an argument the generated types call required (PostgREST passes JSON null through). */
function sqlNull<T>(v: T | null): T {
  return v as T;
}

function one<T>(data: T | T[]): T {
  return Array.isArray(data) ? (data[0] as T) : data;
}

function useRefresh() {
  const qc = useQueryClient();
  return (projectId: string) =>
    Promise.all([qc.invalidateQueries({ queryKey: qk.revs(projectId) }), qc.invalidateQueries({ queryKey: qk.permits })]);
}

/** A wall's details (revs.manage); empty = none. Version-checked; the same values again return the wall as it is. */
export function useSaveWallDetails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { area: RevArea; details: WallDetails }): Promise<RevArea> => {
      if (isMock()) return mockWalls.saveDetails(v.area, v.details);
      const d = v.details;
      const data = throwIfError(
        await supabase.rpc('rev_area_details_save', {
          p_id: v.area.id,
          p_version: v.area.version,
          p_wall_tag: sqlNull(d.wall_tag),
          p_rating: sqlNull(d.rating),
          p_ul_design: sqlNull(d.ul_design),
          p_fire_area: sqlNull(d.fire_area),
          p_sheet_ref: sqlNull(d.sheet_ref),
          p_check_note: sqlNull(d.check_note),
        }),
      );
      return parseArea(one(data));
    },
    onSettled: (_r, _e, v) => qc.invalidateQueries({ queryKey: qk.revs(v.area.project_id) }),
  });
}

interface SignoffTarget {
  projectId: string;
  areaId: string;
  itemIds: string[];
}

/** Signed off before the app: these items of a wall (one, or a whole rev), with what the sign-off says. */
export function useSetSignoff() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: SignoffTarget & SignoffValues): Promise<RevSignoff[]> => {
      if (isMock()) return mockWalls.setSignoff(v.areaId, v.itemIds, v);
      return throwIfError(
        await supabase.rpc('rev_signoff_set', {
          p_area_id: v.areaId,
          p_item_ids: v.itemIds,
          p_ofs_number: sqlNull(v.ofsNumber),
          p_signed_on: sqlNull(v.signedOn),
          p_note: sqlNull(v.note),
        }),
      );
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}

/** The Undo: these items of a wall are no longer signed off before. Answers what it cleared. */
export function useClearSignoff() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: SignoffTarget): Promise<RevSignoff[]> => {
      if (isMock()) return mockWalls.clearSignoff(v.areaId, v.itemIds);
      return throwIfError(await supabase.rpc('rev_signoff_clear', { p_area_id: v.areaId, p_item_ids: v.itemIds }));
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}
