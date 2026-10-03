// Setup's moves, each a version-checked save (CLAUDE.md rule 7) with Undo in the toast instead of "are you sure?"
// (rule 16): rename a list, rev, item or wall (Undo puts the old values back, a wall's line on the plan too: another
// sheet takes it off the plan, 0059), remove one (Undo restores it), and move an item or a wall up or down (it swaps
// places with its neighbor). Undo uses mutateAsync, which settles even if the screen has moved on.
import { messageOf } from '../../data/errors';
import {
  useRemoveRev,
  useRestoreRev,
  useSaveRev,
  useSaveRevArea,
  useSaveRevItem,
  useSaveRevList,
} from '../../data/revs.mutations';
import { usePlaceRevArea } from '../../data/revs.plan';
import type { Rev, RevArea, RevItem, RevKind, RevList } from '../../data/revs.types';
import { useToast } from '../../ui/Toast';
import { neighbor } from './model';

export interface ListValues {
  name: string;
  phase: string;
  permitId: string | null;
}

export interface WallValues {
  level: string;
  name: string;
  sheetFileId: string | null;
}

export function useSetupActions(projectId: string) {
  const toast = useToast();
  const saveList = useSaveRevList();
  const saveRev = useSaveRev();
  const saveItem = useSaveRevItem();
  const saveArea = useSaveRevArea();
  const remove = useRemoveRev();
  const restore = useRestoreRev();
  const place = usePlaceRevArea();

  const failed = (e: unknown) => {
    toast.show({ tone: 'error', message: messageOf(e) });
  };
  const saved = (message: string, undo: () => Promise<unknown>) => {
    toast.show({ message, action: { label: 'Undo', onClick: () => { void undo().catch(failed); } } });
  };

  return {
    busy: [saveList, saveRev, saveItem, saveArea, remove, restore, place].some((m) => m.isPending),

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

    wall: async (area: RevArea, v: WallValues): Promise<boolean> => {
      try {
        const row = await saveArea.mutateAsync({ area, ...v, position: null });
        saved('Wall saved.', async () => {
          const back = await saveArea.mutateAsync({ area: row, level: area.level, name: area.name, sheetFileId: area.sheet_file_id, position: null });
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

    remove: (kind: RevKind, row: { id: string; version: number }, name: string) => {
      remove.mutate(
        { projectId, kind, id: row.id, version: row.version },
        {
          onSuccess: (gone) => {
            saved(`${name} removed.`, () => restore.mutateAsync({ projectId, kind, id: gone.id, version: gone.version }));
          },
          onError: failed,
        },
      );
    },

    /** Swaps an item with the one above or below it in its rev. */
    moveItem: (rows: readonly RevItem[], item: RevItem, dir: -1 | 1) => {
      const other = neighbor(rows, item.id, dir);
      if (!other) return;
      const there = other.position === item.position ? other.position + dir : other.position;
      void (async () => {
        await saveItem.mutateAsync({ projectId, revId: item.rev_id, item, name: item.name, company: item.company ?? '', position: there });
        await saveItem.mutateAsync({ projectId, revId: other.rev_id, item: other, name: other.name, company: other.company ?? '', position: item.position });
      })().catch(failed);
    },

    /** Swaps a wall with the one above or below it on its level. */
    moveWall: (rows: readonly RevArea[], area: RevArea, dir: -1 | 1) => {
      const other = neighbor(rows, area.id, dir);
      if (!other) return;
      const there = other.position === area.position ? other.position + dir : other.position;
      void (async () => {
        await saveArea.mutateAsync({ area, level: area.level, name: area.name, sheetFileId: area.sheet_file_id, position: there });
        await saveArea.mutateAsync({ area: other, level: other.level, name: other.name, sheetFileId: other.sheet_file_id, position: area.position });
      })().catch(failed);
    },
  };
}
