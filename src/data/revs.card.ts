// A room's inspection card (migrations 0101, 0119; Jesse, Oct 12: pick what the room's walls need; Oct 23: "save it.
// Then there should be some kind of lock on it so not everyone can edit it"). Writes, revs.manage: the boxes changed
// on the card's Setup (each wall x item Needed or Not needed), which locks the card; its Undo (what the save answered,
// put back, the card unlocked as before); Unlock to edit and lock again; one item on or off for one wall (refused while
// a room of the wall has its card locked). The database never changes a box with a sign-off or a request. Read: who
// locked the job's cards, by name. Every write refreshes the job's revs.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockCard from './mock/revCard';
import type { RevRoom } from './revs.rooms';

/** What a save changed: walls in or out of the room (none from Setup now), boxes set not needed (na) or needed again,
 *  and when the card was set up before (null: never). The Undo sends it back. */
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

/** One box changed on Setup. */
export type CardCellChange = { area_id: string; item_id: string; needed: boolean };

const itemSchema = z.object({ area_id: z.string(), item_id: z.string(), na: z.boolean(), changed: z.boolean() });
const lockerSchema = z.array(z.object({ user_id: z.string(), name: z.string() }));

/** Who locked a card of the job, by user id. */
export type CardLockers = ReadonlyMap<string, string>;

function useRefresh() {
  const qc = useQueryClient();
  return (projectId: string) => qc.invalidateQueries({ queryKey: qk.revs(projectId) });
}

/** The boxes changed on the room's card; saved, the card is locked. */
export function useSetCard() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { room: RevRoom; cells: CardCellChange[] }): Promise<CardSaved> => {
      if (isMock()) return mockCard.set(v.room, v.cells);
      const data: unknown = throwIfError(await supabase.rpc('rev_card_set', { p_room_id: v.room.id, p_version: v.room.version, p_cells: v.cells }));
      const saved = savedSchema.parse(data);
      return { version: saved.room.version, undo: { walls: saved.walls, cells: saved.cells, was: saved.was } };
    },
    onSettled: (_r, _e, v) => refresh(v.room.project_id),
  });
}

/** The Undo of a save (its saver's): the boxes back, the card unlocked as before. */
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

/** Unlock to edit (locked false), or lock again. */
export function useLockCard() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { room: RevRoom; locked: boolean }): Promise<void> => {
      if (isMock()) {
        await mockCard.lock(v.room, v.locked);
        return;
      }
      throwIfError(await supabase.rpc('rev_card_lock', { p_room_id: v.room.id, p_version: v.room.version, p_locked: v.locked }));
    },
    onSettled: (_r, _e, v) => refresh(v.room.project_id),
  });
}

/** Whoever locked a card of the job, by name ("Locked by"). */
export function useCardLockers(projectId: string) {
  return useQuery({
    queryKey: qk.revsPart(projectId, 'card-lockers'),
    queryFn: async (): Promise<CardLockers> => {
      const rows = isMock() ? await mockCard.lockers(projectId) : throwIfError(await supabase.rpc('rev_card_lockers', { p_project_id: projectId }));
      return new Map(lockerSchema.parse(rows).map((r) => [r.user_id, r.name]));
    },
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
