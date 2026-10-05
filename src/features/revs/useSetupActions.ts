// Setup's moves, each a version-checked save (CLAUDE.md rule 7) with Undo in the toast instead of "are you sure?"
// (rule 16): add a rev (Undo removes it), rename a list, rev, item or wall (Undo puts the old values back, a wall's
// line on the plan too: another sheet takes it off the plan, 0059), remove one (Undo restores it), and move an item or
// a wall up or down (one save, rev_move 0080: it swaps places with its neighbor; Undo moves it back). Undo uses
// mutateAsync, which settles even if the screen has moved on.
import { messageOf } from '../../data/errors';
import {
  useRemoveRev,
  useRestoreRev,
  useSaveRev,
  useSaveRevArea,
  useSaveRevItem,
  useSaveRevList,
} from '../../data/revs.mutations';
import { useMoveRev, usePlaceRevArea } from '../../data/revs.plan';
import type { Rev, RevArea, RevItem, RevKind, RevList, WallDetails } from '../../data/revs.types';
import { useSaveWallDetails } from '../../data/revs.walls';
import { useToast } from '../../ui/Toast';

export interface ListValues {
  name: string;
  phase: string;
  permitId: string | null;
}

export interface WallValues {
  level: string;
  name: string;
  sheetFileId: string | null;
  /** Tag, rating, UL design, fire area, sheet number, what to check (0082); null = none. */
  details: WallDetails;
}

const detailsFrom = (a: RevArea): WallDetails => ({
  wall_tag: a.wall_tag, rating: a.rating, ul_design: a.ul_design, fire_area: a.fire_area, sheet_ref: a.sheet_ref, check_note: a.check_note,
});

const sameDetails = (a: WallDetails, b: WallDetails) => (Object.keys(a) as (keyof WallDetails)[]).every((k) => a[k] === b[k]);

export function useSetupActions(projectId: string) {
  const toast = useToast();
  const saveList = useSaveRevList();
  const saveRev = useSaveRev();
  const saveItem = useSaveRevItem();
  const saveArea = useSaveRevArea();
  const remove = useRemoveRev();
  const restore = useRestoreRev();
  const place = usePlaceRevArea();
  const move = useMoveRev();
  const saveDetails = useSaveWallDetails();

  const failed = (e: unknown) => {
    toast.show({ tone: 'error', message: messageOf(e) });
  };
  const saved = (message: string, undo: () => Promise<unknown>) => {
    toast.show({ message, action: { label: 'Undo', onClick: () => { void undo().catch(failed); } } });
  };

  return {
    busy: [saveList, saveRev, saveItem, saveArea, remove, restore, place, move, saveDetails].some((m) => m.isPending),

    /** Saves; true when saved (the form closes). */
    list: async (list: RevList, v: ListValues): Promise<boolean> => {
      try {
        const row = await saveList.mutateAsync({ list, ...v });
        saved('List saved.', () => saveList.mutateAsync({ list: row, name: list.name, phase: list.phase ?? '', permitId: list.permit_id }));
        return true;
      } catch (e) {
        failed(e);
        return false;
      }
    },

    rev: async (rev: Rev, number: number, name: string): Promise<boolean> => {
      try {
        const row = await saveRev.mutateAsync({ projectId, listId: rev.list_id, rev, number, name });
        saved('Rev saved.', () => saveRev.mutateAsync({ projectId, listId: rev.list_id, rev: row, number: rev.number, name: rev.name }));
        return true;
      } catch (e) {
        failed(e);
        return false;
      }
    },

    /** A new rev on a list (one OSFM added later). */
    addRev: async (listId: string, number: number, name: string): Promise<boolean> => {
      try {
        const row = await saveRev.mutateAsync({ projectId, listId, rev: null, number, name });
        saved(`Rev ${String(row.number)} added.`, () => remove.mutateAsync({ projectId, kind: 'rev', id: row.id, version: row.version }));
        return true;
      } catch (e) {
        failed(e);
        return false;
      }
    },

    item: async (item: RevItem, name: string, company: string): Promise<boolean> => {
      try {
        const row = await saveItem.mutateAsync({ projectId, revId: item.rev_id, item, name, company, position: null });
        saved('Item saved.', () =>
          saveItem.mutateAsync({ projectId, revId: item.rev_id, item: row, name: item.name, company: item.company ?? '', position: null }),
        );
        return true;
      } catch (e) {
        failed(e);
        return false;
      }
    },

    /** A new item at the end of a rev. */
    addItem: async (revId: string, name: string, company: string): Promise<boolean> => {
      try {
        const row = await saveItem.mutateAsync({ projectId, revId, item: null, name, company, position: null });
        saved(`${row.name} added.`, () => remove.mutateAsync({ projectId, kind: 'item', id: row.id, version: row.version }));
        return true;
      } catch (e) {
        failed(e);
        return false;
      }
    },

    /** A wall's name, level, sheet, then its details when they changed (a second save on the new version). */
    wall: async (area: RevArea, v: WallValues): Promise<boolean> => {
      try {
        const was = detailsFrom(area);
        const changed = !sameDetails(was, v.details);
        const base = await saveArea.mutateAsync({ area, level: v.level, name: v.name, sheetFileId: v.sheetFileId, position: null });
        const row = changed ? await saveDetails.mutateAsync({ area: base, details: v.details }) : base;
        saved('Wall saved.', async () => {
          const plain = changed ? await saveDetails.mutateAsync({ area: row, details: was }) : row;
          const back = await saveArea.mutateAsync({ area: plain, level: area.level, name: area.name, sheetFileId: area.sheet_file_id, position: null });
          if (area.geom !== null && back.geom === null) {
            await place.mutateAsync({ area: back, sheetFileId: area.sheet_file_id, page: area.sheet_page, geom: area.geom });
          }
        });
        return true;
      } catch (e) {
        failed(e);
        return false;
      }
    },

    /** Removes; true when removed. Settles even if the screen moved on (a wall's own page closes). */
    remove: async (kind: RevKind, row: { id: string; version: number }, name: string): Promise<boolean> => {
      try {
        const gone = await remove.mutateAsync({ projectId, kind, id: row.id, version: row.version });
        saved(`${name} removed.`, () => restore.mutateAsync({ projectId, kind, id: gone.id, version: gone.version }));
        return true;
      } catch (e) {
        failed(e);
        return false;
      }
    },

    /** Up / Down: an item in its rev, a wall on its level; one save, Undo moves it back. */
    move: (kind: 'item' | 'area', row: { id: string; version: number }, name: string, dir: -1 | 1) => {
      move.mutate(
        { projectId, kind, id: row.id, version: row.version, dir },
        {
          onSuccess: (moved) => {
            saved(`${name} moved ${dir < 0 ? 'up' : 'down'}.`, () =>
              move.mutateAsync({ projectId, kind, id: moved.id, version: moved.version, dir: dir < 0 ? 1 : -1 }),
            );
          },
          onError: failed,
        },
      );
    },
  };
}
