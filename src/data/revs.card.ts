// A room's inspection card (migration 0101; Jesse, Oct 12: pick what the room's walls need, "everything else should
// just go away"). Writes only, revs.manage: the card saved (the walls kept on it, the items they need), its Undo (what
// the save answered, put back), and one item on or off for one wall. The database never changes a cell with a sign-off,
// a request or a failure, and keeps an N/A marked by hand. Every write refreshes the job's revs.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockCard from './mock/revCard';
import type { RevRoom } from './revs.rooms';

/** What a save changed: walls in or out of the room, cells set up as not applicable (na) or applicable again, and when
 *  the card was set up before (null: never). The Undo sends it back. */
const cardUndoSchema = z.object({
  walls: z.array(z.object({ area_id: z.string(), on: z.boolean() })),
  cells: z.array(z.object({ area_id: z.string(), item_id: z.string(), na: z.boolean() })),
  was: z.string().nullable(),
});
export type CardUndo = z.infer<typeof cardUndoSchema>;

const savedSchema = cardUndoSchema.extend({ room: z.object({ version: z.number().int() }).passthrough() });

export interface CardSaved {
  /** The room's version now (the Undo's version check). */
  version: number;
  undo: CardUndo;
}

const itemSchema = z.object({ area_id: z.string(), item_id: z.string(), na: z.boolean(), changed: z.boolean() });

function useRefresh() {
  const qc = useQueryClient();
  return (projectId: string) => qc.invalidateQueries({ queryKey: qk.revs(projectId) });
}

/** The room's card: the walls kept on it and the items they need. */
export function useSaveCard() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { room: RevRoom; areaIds: string[]; itemIds: string[] }): Promise<CardSaved> => {
      if (isMock()) return mockCard.save(v.room, v.areaIds, v.itemIds);
      const data: unknown = throwIfError(
        await supabase.rpc('rev_card_save', { p_room_id: v.room.id, p_version: v.room.version, p_area_ids: v.areaIds, p_item_ids: v.itemIds }),
      );
      const saved = savedSchema.parse(data);
      return { version: saved.room.version, undo: { walls: saved.walls, cells: saved.cells, was: saved.was } };
    },
    onSettled: (_r, _e, v) => refresh(v.room.project_id),
  });
}

/** The Undo of a save. */
export function useUndoCard() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { projectId: string; roomId: string; version: number; undo: CardUndo }): Promise<void> => {
      if (isMock()) {
        await mockCard.undo(v.roomId, v.version, v.undo);
        return;
      }
      throwIfError(await supabase.rpc('rev_card_undo', { p_room_id: v.roomId, p_version: v.version, p_undo: v.undo }));
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}

/** One item on or off for one wall (its Undo: the same, turned over). */
export function useCardItem() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { projectId: string; areaId: string; itemId: string; on: boolean }): Promise<boolean> => {
      if (isMock()) return mockCard.item(v.areaId, v.itemId, v.on);
      const data: unknown = throwIfError(await supabase.rpc('rev_card_item', { p_area_id: v.areaId, p_item_id: v.itemId, p_on: v.on }));
      return itemSchema.parse(data).changed;
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}
