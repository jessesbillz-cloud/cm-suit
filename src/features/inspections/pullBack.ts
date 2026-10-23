// Not ready (0109; Jesse, Oct 22: "The fire marshal shouldn't have to be responsible for taking things off the
// inspection request that weren't ready or failed. That should be the contractor"): who may take walls x items off an
// OFS request (its requester, the job's OFS duty holder, the GC step: ir_may_pull_back), until when (no result on it or
// its walls, not signed: ir_pull_open), the request's walls each with its items for one tap a wall or an item, and what
// the toast says. The database decides again. Pure; tested in pullBack.test.ts.
import type { IrRequest } from '../../data/inspections.types';
import type { IrRevItem, RevSetup } from '../../data/revs.types';
import type { MarkupColor } from '../../lib/markup';

interface Who {
  request: boolean;
  gcApprove: boolean;
}

/** May I take walls off this request: mine (I file requests), I hold the job's OFS duty, or I do the GC step. */
export function mayPullBack(row: Pick<IrRequest, 'kind' | 'requested_by'>, can: Who, me: string, holder: boolean): boolean {
  return row.kind === 'ofs' && ((row.requested_by === me && can.request) || holder || can.gcApprove);
}

/** Still open to take walls off: not withdrawn or done, no result on it or any of its walls, not signed. */
export function pullOpen(row: Pick<IrRequest, 'status' | 'result' | 'signed_at'>, cells: readonly Pick<IrRevItem, 'result'>[]): boolean {
  return row.status !== 'withdrawn' && row.status !== 'complete' && row.result === null && row.signed_at === null && cells.every((c) => c.result === null);
}

interface PullItem {
  cell: IrRevItem;
  name: string;
  color: MarkupColor;
}

export interface PullWall {
  areaId: string;
  /** The wall, with its level when the request spans levels. */
  label: string;
  items: PullItem[];
}

const asColor = (n: number): MarkupColor => (n === 3 ? 3 : n === 2 ? 2 : 1);
const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/** The request's walls by level then place, each with its items in color order. */
export function pullWalls(cells: readonly IrRevItem[], setup: RevSetup): PullWall[] {
  const areas = new Map(setup.areas.map((a) => [a.id, a]));
  const names = new Map(setup.items.map((i) => [i.id, i.name]));
  const levels = new Set(cells.map((c) => areas.get(c.area_id)?.level.trim() ?? ''));
  const walls = new Map<string, PullWall>();
  for (const cell of [...cells].sort((x, y) => x.color - y.color)) {
    const a = areas.get(cell.area_id);
    const level = a?.level.trim() ?? '';
    const name = a?.name ?? 'Removed';
    const wall = walls.get(cell.area_id) ?? { areaId: cell.area_id, label: levels.size > 1 && level !== '' ? `${level} · ${name}` : name, items: [] };
    wall.items.push({ cell, name: names.get(cell.item_id) ?? 'Removed', color: asColor(cell.color) });
    walls.set(cell.area_id, wall);
  }
  const place = (id: string) => areas.get(id);
  return [...walls.values()].sort((x, y) => {
    const a = place(x.areaId);
    const b = place(y.areaId);
    return natural(a?.level.trim() ?? '', b?.level.trim() ?? '') || (a?.position ?? 0) - (b?.position ?? 0) || x.label.localeCompare(y.label);
  });
}

/** "Wall A taken off." for a whole wall, "Fire Tape taken off Wall A." for one item. */
export function takenOffMessage(wall: PullWall, item: PullItem | null): string {
  return item === null || wall.items.length === 1 ? `${wall.label} taken off.` : `${item.name} taken off ${wall.label}.`;
}
