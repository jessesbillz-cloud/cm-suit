// A wall added on the spot (migration 0113; Jesse, Oct 23: "I'm standing at this wall and you guys don't have it laid
// out for me - so here it is"): whoever files OFS requests (or manages the cards) adds a room's wall to the card's list,
// a new room with it when its number isn't on the level yet. A tag another wall of the job has brings that wall's
// rating, UL design and sheet number (the database does it). Added by someone who does not manage the cards, it is
// marked until a manager confirms it, edits its details or removes it (rev_field_confirm, rev_area_details_save,
// rev_remove). Every write refreshes the job's revs.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mock from './mock/revField';

export type WallSide = 'north' | 'south' | 'east' | 'west' | 'other';

export interface FieldWall {
  projectId: string;
  listId: string;
  /** A room of the list, or else a room number (and name) on the level, found or added. */
  roomId: string | null;
  level: string;
  roomNumber: string;
  roomName: string;
  side: WallSide;
  /** The wall's short name when the side is other ("Enclosure"). */
  name: string;
  wallTag: string;
  rating: string;
}

const addedSchema = z.object({ area_id: z.string(), room_id: z.string(), added: z.boolean() });
type Added = z.infer<typeof addedSchema>;

const orNull = (s: string) => (s.trim() === '' ? null : s.trim());

export function useAddFieldWall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: FieldWall): Promise<Added> => {
      if (isMock()) return mock.addWall(v);
      const data: unknown = throwIfError(
        await supabase.rpc('rev_field_wall_add', {
          p_list_id: v.listId,
          p_level: v.level.trim(),
          p_room_id: v.roomId as string,
          p_room_number: v.roomNumber.trim(),
          p_room_name: v.roomName.trim(),
          p_side: v.side,
          p_name: v.name.trim(),
          p_wall_tag: orNull(v.wallTag) as string,
          p_rating: orNull(v.rating) as string,
        }),
      );
      return addedSchema.parse(data);
    },
    onSettled: (_r, _e, v) => qc.invalidateQueries({ queryKey: qk.revs(v.projectId) }),
  });
}

/** A manager's check of a wall added on the spot (its room with it). */
export function useConfirmFieldWall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { projectId: string; areaId: string }): Promise<void> => {
      if (isMock()) {
        mock.confirm(v.areaId);
        return;
      }
      throwIfError(await supabase.rpc('rev_field_confirm', { p_area_id: v.areaId }));
    },
    onSettled: (_r, _e, v) =>
      Promise.all([qc.invalidateQueries({ queryKey: qk.revs(v.projectId) }), qc.invalidateQueries({ queryKey: qk.tasksAll })]),
  });
}
