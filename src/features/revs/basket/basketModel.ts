// The request being built, worked out for the screens (0113; Jesse, Oct 23: "walk up to the wall ... top of wall here
// too ... and there should be a way to do top of wall for the entire room"): which cells are in it, the bar's line
// ("9 items on 6 walls"), what Add for the whole room would add per item, and the review's groups (each request Send
// would file, its item, its walls with their room and facts). The database decides what goes in and how it is split;
// this only names it. Pure; tested in basketModel.test.ts.
import type { Basket, BasketCell } from '../../../data/revs.basket';
import type { RevRoom, RevRooms } from '../../../data/revs.rooms';
import { wallFacts, type Rev, type RevArea, type RevItem, type RevSetup } from '../../../data/revs.types';
import { canAsk, cellOf, type StatusIndex } from '../model';
import { bubbleNames } from '../room/wallBubble';
import { roomLabel } from '../rooms';
import { calloutOf } from '../wallPage';

export const cellKey = (areaId: string, itemId: string) => `${areaId}|${itemId}`;

export function inBasket(cells: readonly BasketCell[]): ReadonlySet<string> {
  return new Set(cells.map((c) => cellKey(c.area_id, c.item_id)));
}

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/** The bar: "9 items on 6 walls" (an item on a wall counts once). */
export function barLine(cells: readonly BasketCell[]): string {
  const walls = new Set(cells.map((c) => c.area_id)).size;
  return `${plural(cells.length, 'item', 'items')} on ${plural(walls, 'wall', 'walls')}`;
}

interface RoomItem {
  item: RevItem;
  /** Walls of the room it still needs asking on (open or failed) and not in the request yet. */
  toAdd: number;
  /** Walls of the room it is in the request on. */
  inIt: number;
}

export interface RoomRev {
  rev: Rev;
  items: RoomItem[];
}

/** Per rev, the items the room's walls need (an item not applicable on every wall is left out), with what Add for the
 *  whole room would add. */
export function roomItems(setup: RevSetup, index: StatusIndex, areas: readonly RevArea[], basket: ReadonlySet<string>): RoomRev[] {
  const lists = new Set(areas.map((a) => a.list_id));
  return setup.revs
    .filter((r) => lists.has(r.list_id))
    .map((rev) => ({
      rev,
      items: setup.items
        .filter((i) => i.rev_id === rev.id)
        .map((item) => {
          const cells = areas.filter((a) => a.list_id === rev.list_id).map((a) => ({ a, s: cellOf(index, a.id, item.id).status }));
          const inIt = cells.filter(({ a }) => basket.has(cellKey(a.id, item.id))).length;
          const toAdd = cells.filter(({ a, s }) => canAsk(s) && !basket.has(cellKey(a.id, item.id))).length;
          return { item, toAdd, inIt, needed: cells.some(({ s }) => s !== 'na') };
        })
        .filter((i) => i.needed)
        .map(({ item, toAdd, inIt }) => ({ item, toAdd, inIt })),
    }))
    .filter((r) => r.items.length > 0);
}

interface ReviewWall {
  area: RevArea;
  /** "0302 Classroom · North wall" (its room and its bubble there), or the wall's own name. */
  label: string;
  /** "F6a · 1 HR · UL U419 · A201", read from the wall. */
  facts: string;
}

export interface ReviewGroup {
  /** The request's place in Send's order (its OFS number's place too). */
  key: string;
  item: RevItem;
  rev: Rev | undefined;
  ofsNumber: number;
  walls: ReviewWall[];
}

function roomOf(rooms: RevRooms, areaId: string): RevRoom | undefined {
  const link = rooms.walls.find((w) => w.area_id === areaId);
  return link ? rooms.rooms.find((r) => r.id === link.room_id) : undefined;
}

/** A wall on the review: its room and its own name, its facts. */
function reviewWall(area: RevArea, rooms: RevRooms): ReviewWall {
  const room = roomOf(rooms, area.id);
  const { title } = calloutOf(area.name, area.wall_tag);
  const label = room ? `${roomLabel(room)} · ${bubbleNames(room, [area]).get(area.id) ?? title}` : title;
  return { area, label, facts: wallFacts(area) };
}

/** Each request Send would file, as the database splits them, named from the setup. */
export function reviewGroups(basket: Basket, setup: RevSetup, rooms: RevRooms): ReviewGroup[] {
  return basket.groups.flatMap((g, k) => {
    const item = setup.items.find((i) => i.id === g.item_id);
    if (!item) return [];
    const walls = g.area_ids.flatMap((id) => {
      const a = setup.areas.find((x) => x.id === id);
      return a ? [reviewWall(a, rooms)] : [];
    });
    return [{ key: `${String(k)}:${g.item_id}`, item, rev: setup.revs.find((r) => r.id === item.rev_id), ofsNumber: g.ofs_number, walls }];
  });
}
