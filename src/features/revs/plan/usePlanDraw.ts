// Drawing walls on the plan (managers; Jesse, Oct 3: "add as many walls as we want to the plan sheet ... piecemeal,
// around the whole building"). Add: tap the start, the end, more taps for corners, Done, name it, Save; the next wall
// starts at once. Undo in the toast takes the new wall off again (rev_remove). Place: an existing wall (from its page,
// ?place=) gets its line the same way, without a name; Undo puts its old place back. Taps land on a corner already drawn
// when close, and square up when nearly level or plumb (planGeom placePoint).
import { useState } from 'react';
import { messageOf } from '../../../data/errors';
import { useRemoveRev } from '../../../data/revs.mutations';
import { useDrawRevArea, usePlaceRevArea } from '../../../data/revs.plan';
import type { RevArea } from '../../../data/revs.types';
import { useToast } from '../../../ui/Toast';
import { calloutOf } from '../wallPage';
import { isLine, placePoint, type PlanTarget, type Pt } from './planGeom';

/** A tap this close to a corner already drawn (screen pixels) lands on it. */
const SNAP_PX = 14;

type DrawStep = 'look' | 'draw' | 'name';

interface Options {
  projectId: string;
  level: string;
  listId: string | null;
  target: PlanTarget | null;
  /** The wall being placed (?place=), or null to add new walls. */
  placing: RevArea | null;
  /** Corners of the walls on this sheet, where a tap may land. */
  corners: readonly Pt[];
  /** After a wall is placed: show it on the plan. */
  onPlaced: (area: RevArea) => void;
}

export function usePlanDraw({ projectId, level, listId, target, placing, corners, onPlaced }: Options) {
  const toast = useToast();
  const draw = useDrawRevArea();
  const place = usePlaceRevArea();
  const remove = useRemoveRev();
  const [adding, setAdding] = useState<DrawStep>('look');
  const [points, setPoints] = useState<Pt[]>([]);
  const [name, setName] = useState('');
  // Placing a wall is drawing until it is saved (it comes from the URL); adding is drawing until Close. Another wall to
  // place starts a new line.
  const step: DrawStep = placing ? 'draw' : adding;
  const [lineFor, setLineFor] = useState(placing?.id ?? null);
  if ((placing?.id ?? null) !== lineFor) {
    setLineFor(placing?.id ?? null);
    setPoints([]);
  }

  const failed = (e: unknown) => {
    toast.show({ tone: 'error', message: messageOf(e) });
  };

  const reset = (next: DrawStep) => {
    setPoints([]);
    setName('');
    setAdding(next);
  };

  const saveNew = async () => {
    if (!target || !listId || !isLine(points) || name.trim() === '') return;
    try {
      const row = await draw.mutateAsync({ projectId, listId, level, name, sheetFileId: target.fileId, page: target.page, geom: points });
      reset('draw');
      toast.show({
        message: `${calloutOf(row.name).title} added.`,
        action: {
          label: 'Undo',
          onClick: () => {
            void remove.mutateAsync({ projectId, kind: 'area', id: row.id, version: row.version }).catch(failed);
          },
        },
      });
    } catch (e) {
      failed(e);
    }
  };

  const savePlace = async (area: RevArea) => {
    if (!target || !isLine(points)) return;
    try {
      const row = await place.mutateAsync({ area, sheetFileId: target.fileId, page: target.page, geom: points });
      reset('look');
      onPlaced(row);
      toast.show({
        message: `${calloutOf(row.name).title} placed.`,
        action: {
          label: 'Undo',
          onClick: () => {
            void place.mutateAsync({ area: row, sheetFileId: area.sheet_file_id, page: area.sheet_page, geom: area.geom }).catch(failed);
          },
        },
      });
    } catch (e) {
      failed(e);
    }
  };

  return {
    step,
    points,
    name,
    busy: draw.isPending || place.isPending,
    setName,
    start: () => {
      reset('draw');
    },
    close: () => {
      reset('look');
    },
    /** A tap on the sheet while drawing: `scale` is screen pixels per page width; `aspect` the page's height / width. */
    tap: (p: Pt, scale: number, aspect: number) => {
      setPoints((line) => [...line, placePoint(p, line, corners, SNAP_PX / Math.max(scale, 1), aspect)]);
    },
    undoPoint: () => {
      setPoints((line) => line.slice(0, -1));
    },
    /** Done drawing: a new wall is named next; a placed wall saves. */
    done: () => {
      if (!isLine(points)) return;
      if (placing) void savePlace(placing);
      else setAdding('name');
    },
    /** Back from naming to the line. */
    back: () => {
      setAdding('draw');
    },
    save: () => {
      void saveNew();
    },
  };
}
