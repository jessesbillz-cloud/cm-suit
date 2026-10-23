// The request being built, as every Inspection cards screen uses it (0113): who may build one (ir.request; the
// database also asks revs.read and a job that takes OFS requests), what is in it, a tap that adds a wall's item or takes
// it out again, and Add for the whole room (one item on every wall of the room that still needs it, with Undo). A
// failure is a toast in the database's words.
import { useMemo } from 'react';
import { useCapability } from '../../../data/queries';
import { messageOf } from '../../../data/errors';
import { useBasketAdd, useBasketRemove, useRevBasket } from '../../../data/revs.basket';
import { useToast } from '../../../ui/Toast';
import { cellKey, inBasket } from './basketModel';

export function useBasket(projectId: string) {
  const may = useCapability(projectId, 'ir.request');
  const can = may.data === true;
  const basket = useRevBasket(projectId, can);
  const add = useBasketAdd();
  const remove = useBasketRemove();
  const toast = useToast();
  const cells = useMemo(() => basket.data?.cells ?? [], [basket.data]);
  const keys = useMemo(() => inBasket(cells), [cells]);
  const failed = (e: unknown) => {
    toast.show({ tone: 'error', message: messageOf(e) });
  };

  return {
    /** May build one (and the screens show Add). */
    can,
    /** Whether I may is known. */
    ready: may.data !== undefined,
    basket,
    cells,
    keys,
    busy: add.isPending || remove.isPending,
    has: (areaId: string, itemId: string) => keys.has(cellKey(areaId, itemId)),
    /** A wall's item in, or out again. */
    toggle: (areaId: string, itemId: string) => {
      const v = { projectId, areaIds: [areaId], itemIds: [itemId] };
      if (keys.has(cellKey(areaId, itemId))) remove.mutate(v, { onError: failed });
      else add.mutate(v, { onError: failed });
    },
    /** One item on every wall of the room that still needs it; Undo takes those out again. */
    addRoom: (roomId: string, itemId: string, itemName: string) => {
      add.mutate(
        { projectId, areaIds: [], itemIds: [itemId], roomId },
        {
          onError: failed,
          onSuccess: (b) => {
            const before = keys;
            const added = b.cells.filter((c) => c.item_id === itemId && !before.has(cellKey(c.area_id, c.item_id))).map((c) => c.area_id);
            if (added.length === 0) return;
            toast.show({
              message: `${itemName}: ${String(added.length)} ${added.length === 1 ? 'wall' : 'walls'} added.`,
              action: {
                label: 'Undo',
                onClick: () => {
                  remove.mutate({ projectId, areaIds: added, itemIds: [itemId] }, { onError: failed });
                },
              },
            });
          },
        },
      );
    },
  };
}

export type BasketApi = ReturnType<typeof useBasket>;
